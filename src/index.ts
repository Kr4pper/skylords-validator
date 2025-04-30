import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType, DiagnosticContainer, DiagnosticType, Diagnostic, CardIds, PROJECTILE_CHAIN_IDS, SPELL_GAIN_ABILITY_IDS, Building, SPELL_DMG_ABILITY_REF_IDS, SpellLoca, LocaTableType, ModeLoca, ModeLocaType, ArmorType, SpellLocaType, AbilityLoca, AbilityLocaType, SpellData, SpellType} from './api';
import {loadGameData, loadLanguageTable, loadLocaTable, logger} from './util';
import {CardLocaType} from './api/card-translation';

console.time('elapsed');

const dbPath = process.argv[3];
if (!existsSync(dbPath)) {
    throw new Error(`Invalid db path provided: ${dbPath}`);
}

const cards = loadGameData<Card>(dbPath, GameDataTableType.Card);
const cardDescriptions = loadGameData<CardDescription>(dbPath, GameDataTableType.CardDescription);
const cardTranslations = loadLanguageTable<SpellTranslation>(dbPath, LanguageTableType.Card);
const squads = loadGameData<Squad>(dbPath, GameDataTableType.Squad);
const buildings = loadGameData<Building>(dbPath, GameDataTableType.Building);
const units = loadGameData<Unit>(dbPath, GameDataTableType.Unit);
const modes = loadGameData<Mode>(dbPath, GameDataTableType.Mode);
const modeTranslations = loadLanguageTable<SpellTranslation>(dbPath, LanguageTableType.Mode);
const modeLoca = loadLocaTable<ModeLoca>(dbPath, LocaTableType.Mode);
const spells = loadGameData<Spell>(dbPath, GameDataTableType.Spell);
const spellDescriptions = loadGameData<SpellDescription>(dbPath, GameDataTableType.SpellDescription);
const spellTranslations = loadLanguageTable<SpellTranslation>(dbPath, LanguageTableType.Spell);
const spellLoca = loadLocaTable<SpellLoca>(dbPath, LocaTableType.Spell);
const projectiles = loadGameData<Projectile>(dbPath, GameDataTableType.Projectile);
const abilities = loadGameData<Ability>(dbPath, GameDataTableType.Ability);
const abilityLoca = loadLocaTable<AbilityLoca>(dbPath, LocaTableType.Ability);

const toProcess = Object.values(playerCards);
//const toProcess = [{U0: playerCards.RocketTower.U0}];
//const toProcess = [playerCards.KoboldEngineer];
logger.setLevel(2);

const diagnostics: DiagnosticContainer[] = [];
const processed: {id: CardIds, name: string;}[] = [];

const CARD_BLACKLIST = [
    playerCards.PhaseTower.U0, // uses an ability instead of a spell to deal dmg
    playerCards.Mindweaver.U0, // uses an ability instead of a spell to deal dmg
    playerCards.Molt.U0, // not fully implemented
    playerCards.Hellhound.U0, // not fully implemented
    playerCards.Devourer.U0, // not fully implemented
];
const DP20_BLACKLIST = [
    playerCards.CorsairANature.U0,
    playerCards.CorsairAShadow.U0,
    playerCards.LostSpiritShipAFire.U0,
    playerCards.LostSpiritShipANature.U0,
    playerCards.Spitfire.U0,
];
const TICK_LENGTH_MS = 100;

try {
    for (const upgrades of toProcess) {
        let previousUpgrade: {
            cardName: string,
            cardId: number,
            upgrade: number,
            spells: {[key: string]: SpellData;};
            listedDp20: number,
            listedHealth: number,
            squadSize: number,
            attackRate?: number,
            minDmg?: number;
            maxDmg?: number,
            expectedDp20?: number,
            expectedDp20RoundedTo5?: number;
        } = null;

        if (CARD_BLACKLIST.includes(upgrades.U0 % 1_000_000)) {
            logger.debug('blacklisted card detected');
            continue;
        }

        logger.debug(upgrades);
        const cardName = cardDescriptions.get(upgrades.U0).Name;
        logger.info(`Processing ${cardName} (id:${upgrades.U0})`);

        for (const cardId of Object.values(upgrades)) {
            const card = cards.get(cardId);
            logger.debug({card});

            if (card.Type === CardType.Spell) {
                logger.debug('spell detected, aborting');
                processed.push({id: cardId, name: cardName});
                continue;
            }

            if (card.IsPromo && (cardId < 2_000_000 || cardId > 3_000_000)) {
                logger.debug('promo card with upgrade!=2 detected, aborting');
                processed.push({id: cardId, name: cardName});
                continue;
            }

            const resolveBasicData = (card: Card): {squadSize: number, listedDp20: number, listedHealth: number, modeIds: number[];} => {
                switch (card.Type) {
                    case CardType.Squad:
                        const squad = squads.get(card.DBEntityId);
                        logger.debug({squad});

                        const unit = units.get(squad.SquadMembers[0].UnitId); // might be wrong for mixed-unit squads
                        logger.debug({unit});

                        if (unit.ArmorType >= ArmorType.RangedSmall) {
                            logger.debug('ranged armor type detected', {unit});
                            diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UsesRangedArmor, armor: unit.ArmorType}});
                        }

                        if (unit.ArmorType % 4 !== unit.Size % 4) {
                            logger.debug('incorrect armor type detected', {unit});
                            diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.SizeArmorMismatch, size: unit.Size, armor: unit.ArmorType}});
                        }

                        const squadSize = squad.SquadMembers[0].Count;
                        return {
                            squadSize,
                            listedDp20: Math.round(unit.Archive.Damage * squadSize),
                            listedHealth: Math.round(unit.Health * squadSize),
                            modeIds: squad.ModeIds
                        };
                    case CardType.Building:
                        const building = buildings.get(card.DBEntityId);
                        logger.debug({building});

                        return {
                            squadSize: 1,
                            listedDp20: card.UIdamageValue,
                            listedHealth: building.Health,
                            modeIds: building.ModeIds,
                        };
                    default:
                        throw new Error('unsupported card type');

                }
            };

            const {squadSize, listedDp20, listedHealth, modeIds} = resolveBasicData(card);
            logger.debug({squadSize, listedDp20, listedHealth, modeIds});

            const getStartupMode = (modeIds: number[]): Mode => {
                if (modeIds.length === 0) {
                    diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: 'no mode found'}});
                    return null;
                }

                const allModes = modeIds.map(id => modes.get(id));
                logger.debug({allModes});

                if (allModes.length === 1) {
                    return allModes[0];
                }

                const startupModes = allModes.filter(m => m.Flags & 256);
                logger.debug({startupModes});

                if (startupModes.length !== 1) {
                    diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: `no/multiple startup modes found: ${startupModes.reduce((agg, v) => agg + v.Flags, '')}`}});
                    return null;
                }

                return startupModes[0];
            };

            const mode = getStartupMode(modeIds);
            if (!mode) {
                throw new Error('no mode found');
            }
            logger.debug({mode});

            const getRelevantSpellIds = (card: Card, mode: Mode): number[] => {
                switch (card.Type) {
                    case CardType.Squad:
                        return [...mode.ModeUnitSpells, ...mode.ModeSpells];
                    case CardType.Building:
                        return mode.ModeSpells;
                    default:
                        throw new Error('unsupported card type');
                }
            };

            const spellIds = getRelevantSpellIds(card, mode);
            logger.debug({spellIds});

            type DmgContainer = {minDmg: number, maxDmg: number, minStructureDmg?: number; dmgInterval?: number;};
            const getSpellData = (spellId: number): SpellData => {
                const spell = spells.get(spellId);
                logger.debug({spell});

                const spellName = spellDescriptions.get(spell.Id % 1_000_000).Name; // only U0 have descriptions
                logger.debug({spellName});

                const getProjectileDmg = (projectile: Projectile): DmgContainer => {
                    logger.debug({projectile});
                    logger.debug({C: projectile.ParametersContainer.Parameters});

                    if (projectile.ParametersContainer.Parameters.some(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id))) {
                        logger.debug('chaining projectile detected');
                        const chainSpellIds = projectile.ParametersContainer.Parameters.filter(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id)).reduce((ids, {Value}) => [...ids, Value], []);
                        logger.debug({chainSpellIds});

                        const chainDmg = chainSpellIds.map(id => spells.get(id).ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures)?.Value);
                        logger.debug({chainDmg});

                        const total = chainDmg.reduce((sum, v) => sum + (v || 0), 0);
                        return {minDmg: total, maxDmg: total};
                    }

                    const projectileSpell = spells.get(projectile.TargetSpellId);
                    return getSpellDmg(projectileSpell);
                };

                const getAbilityDmg = (ability: Ability): DmgContainer => {
                    const parameters = ability.ParametersContainer.Parameters;
                    logger.debug('getAbilityDmg', ability.Id, parameters);

                    const minDmgId = [AbilityParameterIds.DamageOnSingleUnit, AbilityParameterIds.DamagePerTarget].find(id => parameters.find(p => p.Id === id));
                    const maxDmgId = [AbilityParameterIds.TotalCombinedDamage, AbilityParameterIds.TotalDamage].find(id => parameters.find(p => p.Id === id));
                    if (minDmgId && maxDmgId) {
                        const minDmg = parameters.find(p => p.Id === minDmgId).Value;
                        const maxDmg = parameters.find(p => p.Id === maxDmgId).Value;
                        const minStructureDmg = parameters.find(p => p.Id === AbilityParameterIds.DamageOnSingleStructure)?.Value;
                        logger.debug({minDmg, maxDmg, minStructureDmg});
                        logger.debug('returning min, max');
                        return {minDmg, maxDmg, minStructureDmg};
                    }

                    const spellToCast = parameters.find(p => [
                        AbilityParameterIds.SpellToCast,
                        AbilityParameterIds.SpellToCast2,
                        AbilityParameterIds.SpellToCast3,
                        AbilityParameterIds.SpellToCastAfterDelayOnUnit,
                        AbilityParameterIds.SpellToCastAfterDelayOnArea,
                        AbilityParameterIds.SpellToGive,
                        AbilityParameterIds.ChargeableBombSpell,
                        AbilityParameterIds.StartProjectileSpell,
                        AbilityParameterIds.SpellToApply,
                        AbilityParameterIds.ResSpellName,
                        AbilityParameterIds.PlaceMines,
                        AbilityParameterIds.SpellToCastOnTarget,
                        AbilityParameterIds.SpellFork,
                    ].includes(p.Id) && p.Value)?.Value;
                    if (spellToCast) {
                        logger.debug({spellToCast});
                        return getSpellDmg(spells.get(spellToCast));
                    }

                    const abilityToCast = parameters.find(p => [
                        AbilityParameterIds.ChargeableBombAbility,
                        AbilityParameterIds.OverchargeAbility,
                        AbilityParameterIds.AbilityToGain,
                        AbilityParameterIds.AbilityToGain2,
                    ].includes(p.Id) && p.Value)?.Value;
                    if (abilityToCast) {
                        logger.debug({abilityToCast});
                        return getAbilityDmg(abilities.get(abilityToCast));
                    }

                    // flame thrower
                    const interval = parameters.find(p => p.Id === AbilityParameterIds.Interval)?.Value;
                    const dmgDamagePerInterval = parameters.find(p => p.Id === AbilityParameterIds.TotalDamagePerInterval)?.Value;
                    if (interval && dmgDamagePerInterval) {
                        logger.debug({interval, dmgDamagePerInterval});
                        return {minDmg: dmgDamagePerInterval, maxDmg: dmgDamagePerInterval, dmgInterval: interval};
                    }

                    // beam dot
                    const dmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.Damage)?.Value;
                    const delaySteps = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DelaySteps)?.Value; // take this into account here?
                    if (dmg && delaySteps) {
                        logger.debug({dmg, delaySteps});
                        return {minDmg: dmg, maxDmg: dmg, dmgInterval: delaySteps};
                    }
                };

                const getSpellDmg = (spell: Spell): DmgContainer => {
                    logger.debug('getSpellDmg', spell.Id);
                    logger.debug({spell});
                    logger.debug({C: spell.ParametersContainer.Parameters});

                    logger.debug('trying to find projectile');
                    const maybeProjectile = spell.ParametersContainer.Parameters.find(p => [SpellParameterId.Projectile, SpellParameterId.Projectile2].includes(p.Id))?.Value;
                    if (maybeProjectile) {
                        return getProjectileDmg(projectiles.get(maybeProjectile));
                    }

                    logger.debug('trying to find dmg ability');
                    const maybeDmgAbilities = spell.ParametersContainer.Parameters.filter(p => SPELL_DMG_ABILITY_REF_IDS.includes(p.Id) && p.Value);
                    if (maybeDmgAbilities.length > 0) {
                        logger.debug({maybeDmgAbilities});

                        const resolved = maybeDmgAbilities.map(p => getAbilityDmg(abilities.get(p.Value)));
                        logger.debug({resolved});

                        const nonEmpty = resolved.filter(v => v).filter(v => v.minDmg > 0 || v.maxDmg > 0);

                        // hack to return the beam dot part
                        if (nonEmpty.length === 2 && cardId % 1_000_000 === playerCards.EvilEye.U0) {
                            return nonEmpty[0];
                        }

                        // hack to return initial dmg
                        if ([playerCards.GemeyeAShadow.U0, playerCards.GemeyeANature.U0].includes(cardId % 1_000_000)) {
                            return nonEmpty[0];
                        }

                        // hack to return initial dmg
                        if ([playerCards.BatarielAFire.U0, playerCards.BatarielAShadow.U0].includes(cardId % 1_000_000)) {
                            return nonEmpty[1];
                        }

                        if (nonEmpty.length > 1) {
                            throw new Error('more than one potential dmg ability');
                        }

                        if (nonEmpty.length === 1) {
                            return nonEmpty[0];
                        }
                    }

                    logger.debug('trying to find dmg spell');
                    const maybeDmgSpells = spell.ParametersContainer.Parameters.filter(p => [SpellParameterId.SuicideBombSpell, SpellParameterId.PoisonInitialDmgSpell, SpellParameterId.OverchargeSpell].includes(p.Id) && p.Value);
                    if (maybeDmgSpells.length > 0) {
                        logger.debug({maybeDmgAbilities});

                        const resolved = maybeDmgSpells.map(p => getSpellDmg(spells.get(p.Value)));
                        logger.debug({resolved});

                        const nonEmpty = resolved.filter(v => v).filter(v => v.minDmg > 0 || v.maxDmg > 0);
                        logger.debug({nonEmpty});

                        if (nonEmpty.length === 1) {
                            return nonEmpty[0];
                        }
                    }

                    logger.debug('trying to find dmg properties in spell');
                    const minDmg = spell.ParametersContainer.Parameters.find(p => [SpellParameterId.DamageAgainstFigures, SpellParameterId.DamageAgainstFigures2, SpellParameterId.DamageAgainstSquad].includes(p.Id) && p.Value)?.Value;
                    if (minDmg) {
                        const maxDmg = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.MaxDmg)?.Value;
                        return {minDmg: minDmg, maxDmg: maxDmg || minDmg};
                    }

                    logger.debug('trying to find suicide attack spell');
                    const suicideSpellId = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.SuicideBombSpell)?.Value;
                    if (suicideSpellId) {
                        const suicideSpell = spells.get(suicideSpellId);
                        logger.debug({suicideSpell});
                        logger.debug({C: suicideSpell.ParametersContainer.Parameters});

                        return getSpellDmg(suicideSpell);
                    }

                    logger.debug('trying to resolve initial dmg spell');
                    const poisonInitialDmgSpellId = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.PoisonInitialDmgSpell)?.Value;
                    if (poisonInitialDmgSpellId) {
                        const poisonInitialDmgSpell = spells.get(poisonInitialDmgSpellId);
                        logger.debug({poisonInitialDmgSpell});
                        logger.debug({C: poisonInitialDmgSpell.ParametersContainer.Parameters});

                        return getSpellDmg(poisonInitialDmgSpell);
                    }

                    return {minDmg: 0, maxDmg: 0};
                };

                logger.debug({C: spell.ParametersContainer.Parameters});
                const {minDmg, maxDmg, minStructureDmg, dmgInterval} = getSpellDmg(spell);
                logger.debug({minDmg, maxDmg});

                const tryScrapeAttackRate = () => {
                    try {
                        const spellTranslation = spellTranslations.get(spell.Id);
                        logger.debug({spellTranslation});
                        const atkRateContainer = spellTranslation.map(line => new RegExp(/every (\d+) seconds/i).exec(line.Text)).find(v => !!v);
                        return +atkRateContainer[1] * 1000;
                    } catch (err) {
                        logger.trace('Scraping error', err);
                        return null;
                    }
                };

                if ((spell.Flags & 8) === 0) { // autocast
                    // TODO fix this, might need different calc if ResolveSteps is 0
                    const attackRate = TICK_LENGTH_MS * (spell.RecastSteps === 0
                        ? (Math.floor(spell.CastSteps / TICK_LENGTH_MS) + Math.floor(Math.max(spell.ResolveSteps, spell.RecastSteps) / TICK_LENGTH_MS))
                        : (Math.floor((spell.CastSteps + Math.max(spell.ResolveSteps, spell.RecastSteps)) / TICK_LENGTH_MS))
                    );
                    logger.debug({attackRate});

                    const scrapedAttackRate = tryScrapeAttackRate();
                    logger.debug({scrapedAttackRate});

                    if (scrapedAttackRate) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.HardCodedAttackRate, scrapedAttackRate, attackRate}});
                    }

                    return {spell, type: SpellType.AutoCast, attackRate, minDmg, maxDmg, minStructureDmg};
                }
                else { // manual cast
                    logger.debug('manual', {spell}, spell.ParametersContainer.Parameters);
                    return {spell, type: SpellType.ManualCast, minDmg, maxDmg, minStructureDmg, powerCost: spell.ProductionPower};
                }
            };

            const spellData = spellIds.reduce((res, id) => ({...res, [id]: getSpellData(id)}), {} as {[key: number]: SpellData;});
            logger.debug({spellData});

            /**
             * Validations:
             *  x listed dp20 = real dp20 -> accept both exact and rounded to 5 matches?
             *  x hard coded atk rate
             *  upgrade text = real upgrade values
             *  min dmg on unit = min dmg on structure (maybe?)
            */

            type UpgradeData = {
                health?: number,
                dp20?: number,
                spells?: {id: number, gainMinDmg?: number, gainMaxDmg?: number, gainMinStructureDmg?: number, newMinDmg?: number, newMaxDmg?: number; gainPowerCost?: number;}[];
                abilities?: {id: number, flatIncrease?: number, newValue?: number;}[],
            };
            const getUpgradeData = (cardId: CardIds): UpgradeData[] => {
                const translations = cardTranslations.get(cardId);
                const upgradeTemplate = translations.find(t => t.LocaType === CardLocaType.UpgradeTemplate);
                if (!upgradeTemplate) {
                    return [];
                }
                logger.debug({upgradeTemplate});

                if (cardId === 1676) {
                    return []; // Burning Spears U0 incorrectly has an upgrade template
                }

                const result: UpgradeData[] = [];

                const EXTRACT_HP_UPGRADE = new RegExp('<VAR NAME="ability_name" ID="\\d002038">\\s*</FORMAT TAG>\\s*<FORMAT TAG="delta_card_text_style">\\s*<VAR NAME="mode_delta_bonus" ID="(\\d+)">', 'i');
                const hpMatch = EXTRACT_HP_UPGRADE.exec(upgradeTemplate.Text);
                if (hpMatch) {
                    const loca = modeLoca.get(+hpMatch[1]);
                    logger.debug('hpMatch', loca, {L: loca.Values});

                    const modeTranslation = modeTranslations.get(loca.Id).find(t => t.LocaType === CardLocaType.UpgradeData);
                    const hpKey = +modeTranslation.Text.match(/\d+/)[0];
                    logger.debug({modeTranslation, hpKey});

                    const delta = loca.Values.find(v => v.Id === hpKey).Text;
                    result.push({health: +delta});
                }

                const EXTRACT_DP20_UPGRADE = new RegExp('<VAR NAME="ability_name" ID="\\d002039"></FORMAT TAG>\\s*<FORMAT TAG="delta_card_text_style">\\s*<VAR NAME="mode_delta_bonus" ID="(\\d+)">', 'i');
                const dp20Match = EXTRACT_DP20_UPGRADE.exec(upgradeTemplate.Text);
                if (dp20Match) {
                    const loca = modeLoca.get(+dp20Match[1]);
                    if (loca) { // make sure typos in mode delta ID dont cause crash 
                        logger.debug('dp20Match', {L: loca.Values});
                        const delta = loca.Values.find(l => [ModeLocaType.Dp20Modifier, ModeLocaType.Dp20Modifier2].includes(l.Id)).Text;
                        result.push({dp20: +delta});
                    }
                }

                const EXTRACT_SPELL_DELTA_UPGRADE = new RegExp('<FORMAT TAG="delta_card_text_style"><VAR NAME="spell_delta_text" ID="(\\d+)">', 'ig');
                const spellUpgrades: UpgradeData['spells'][0][] = [];
                while (true) {
                    const spellDeltaMatch = EXTRACT_SPELL_DELTA_UPGRADE.exec(upgradeTemplate.Text);
                    if (!spellDeltaMatch) {
                        break;
                    }

                    const id = +spellDeltaMatch[1];
                    const loca = spellLoca.get(id);
                    if (loca) { // make sure typos in mode delta ID dont cause crash 
                        logger.debug('spellMatch', {L: loca.Values});
                        const locaMap: Partial<Record<keyof UpgradeData['spells'][0], SpellLocaType[]>> = {
                            gainMinDmg: [SpellLocaType.UpgradeAddMinDmg],
                            gainMaxDmg: [SpellLocaType.UpgradeAddMaxDmg],
                            gainMinStructureDmg: [SpellLocaType.UpgradeAddMinDmgVsStructure],
                            newMinDmg: [SpellLocaType.ActiveMinDmg, SpellLocaType.MinDmg],
                            newMaxDmg: [SpellLocaType.ActiveMaxDmg, SpellLocaType.MaxDmg],
                            gainPowerCost: [SpellLocaType.FlatPowerCostModifier],
                        };
                        let upgradeValues = Object.entries(locaMap).reduce((res, [key, types]) => {
                            const type = types.find(t => loca.Values.find(v => v.Id === t));
                            if (!type) return res;

                            const value = +loca.Values.find(v => v.Id === type)?.Text;
                            return {...res, [key]: value};
                        }, {id} as UpgradeData['spells'][0]);

                        // burrower spit bug handling
                        if (id % 1_000_000 === 1151) {
                            const tmp = upgradeValues.gainMaxDmg;
                            upgradeValues.gainMaxDmg = upgradeValues.gainMinStructureDmg;
                            upgradeValues.gainMinStructureDmg = tmp;
                        }

                        // winter witch beam bug handling ?
                        if (id % 1_000_000 === 964) {
                            upgradeValues.gainMaxDmg = 0;
                        }

                        // winter witch beam bug handling ?
                        if (id % 1_000_000 === 1391) {
                            upgradeValues.gainMaxDmg = 0;
                        }

                        // remove dangling dreadcharger reaping reference
                        if (id % 1_000_000 === 1849) {
                            upgradeValues.id = null;
                        }

                        // morklay trap U3 contains too much loca info
                        if (id === 3001561) {
                            upgradeValues.gainMinDmg = 0;
                            upgradeValues.gainMaxDmg = 0;
                        }

                        // remove dangling frontier keep reference
                        if (id === 3002554 || id === 3002875) {
                            upgradeValues.id = null;
                        }

                        // infernal machine shadow hack
                        if (id === 3002552) {
                            upgradeValues.id = 3002994;
                        }

                        // infernal machine fire hack
                        if (id === 3002888) {
                            upgradeValues.id = 3002995;
                        }

                        // stonekin rageflame (fire+frost) freeze delay
                        if ([1002597, 2002597, 1002914, 2002914].includes(id)) {
                            upgradeValues.id = null;
                        }

                        // satanael setting incorrect power modifier
                        if (id === 1003122 || id === 2003122) {
                            upgradeValues.gainPowerCost = 0;
                        }

                        // amii paladins excessive dmg modifier, incorrect power modifier
                        if (id === 1020050) {
                            upgradeValues.gainMaxDmg = null;
                            upgradeValues.gainPowerCost = null;
                        }

                        // evil eye hack
                        if (id % 1_000_000 === 50400) {
                            const atkCooldown = +loca.Values.find(v => v.Id === SpellLocaType.AtkCooldown).Text;
                            upgradeValues.gainMinDmg = Math.round(upgradeValues.gainMinDmg * +atkCooldown);
                            upgradeValues.gainMaxDmg = Math.round(upgradeValues.gainMaxDmg * +atkCooldown);
                        }

                        // witchclaws (frost+fire) uses dmg key to alter range of spell
                        if (id === 3003576 || id === 3003572) {
                            upgradeValues.gainMaxDmg = null;
                        }

                        // lost grigori (shadow) uses dmg key incorrectly
                        if (id % 1_000_000 === 3275) {
                            upgradeValues.gainMaxDmg = null;
                        }

                        spellUpgrades.push(upgradeValues);
                    }
                }
                result.push({spells: spellUpgrades});

                const EXTRACT_ABILITY_DELTA_UPGRADE = new RegExp('<VAR NAME="ability_delta_text" ID="(\\d+)">', 'ig');
                const abilityUpgrades: UpgradeData['abilities'][0][] = [];
                while (true) {
                    const abilityDeltaMatch = EXTRACT_ABILITY_DELTA_UPGRADE.exec(upgradeTemplate.Text);
                    if (!abilityDeltaMatch) {
                        break;
                    }

                    const loca = abilityLoca.get(+abilityDeltaMatch[1]);
                    if (loca) { // make sure typos in mode delta ID dont cause crash 
                        logger.debug('abilityMatch', {L: loca.Values});
                        const locaMap: Partial<Record<keyof UpgradeData['abilities'][0], AbilityLocaType>> = {
                            flatIncrease: AbilityLocaType.FlatIncrease,
                            newValue: AbilityLocaType.NewValue
                        };
                        const upgradeValues = Object.entries(locaMap).reduce((res, [key, type]) => {
                            const entry = loca.Values.find(v => v.Id === type);
                            if (!entry) return res;
                            return {...res, [key]: +entry.Text};
                        }, {id: +abilityDeltaMatch[1]} as UpgradeData['abilities'][0]);
                        abilityUpgrades.push(upgradeValues);
                    }
                }
                result.push({abilities: abilityUpgrades});

                return result;
            };

            const upgradeData = getUpgradeData(cardId).reduce((aggregate, v) => ({...aggregate, ...v}), {});
            logger.debug({upgradeData}, upgradeData.spells, upgradeData.abilities);

            const extractFromAutocastSpell = () => {
                const autoCastSpell = Object.entries(spellData).find(([_, v]) => v.type === SpellType.AutoCast);
                if (autoCastSpell) {
                    const {attackRate, minDmg, maxDmg} = autoCastSpell[1];
                    const expectedDp20 = minDmg && maxDmg && attackRate ? squadSize * (minDmg + maxDmg) / 2 * 20 / attackRate * 1000 : undefined;
                    const expectedDp20RoundedTo5 = expectedDp20 ? Math.round(5 * Math.round(expectedDp20 / 5)) : undefined;

                    if (!DP20_BLACKLIST.includes(cardId % 1_000_000)) {
                        if (expectedDp20RoundedTo5 && listedDp20 !== expectedDp20RoundedTo5) {
                            diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.Dp20Mismatch, listedDp20, expectedDp20: expectedDp20RoundedTo5, attackRate}});
                        }
                    }

                    return {attackRate, minDmg, maxDmg, expectedDp20, expectedDp20RoundedTo5};
                }
            };

            const result = {
                cardName,
                cardId,
                upgrade: Math.round(cardId / 1_000_000),
                spells: spellData,
                listedDp20,
                listedHealth,
                squadSize,
                ...extractFromAutocastSpell(),
            };
            logger.debug(result);

            if (previousUpgrade && upgradeData) {
                if (upgradeData.dp20) { // melee units
                    logger.debug('dp20 upgrade sanity check', upgradeData.dp20);
                    const oldValue = previousUpgrade.listedDp20;
                    logger.debug({oldValue, listedDp20, upgrade: upgradeData.dp20, squadSize});
                    if (Math.round(oldValue + squadSize * upgradeData.dp20) !== listedDp20) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'dp20', oldValue, newValue: listedDp20, upgradeValue: upgradeData.dp20 * squadSize}});
                    }
                }

                if (upgradeData.health) {
                    logger.debug('health upgrade sanity check', upgradeData.health);
                    const oldValue = previousUpgrade.listedHealth;
                    logger.debug({oldValue, listedHealth, upgrade: upgradeData.health, squadSize});
                    if (Math.round(oldValue + squadSize * upgradeData.health) !== listedHealth) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'health', oldValue, newValue: listedHealth, upgradeValue: upgradeData.health * squadSize}});
                    }
                }

                for (const {id, gainMinDmg, gainMaxDmg, gainMinStructureDmg, newMinDmg, newMaxDmg, gainPowerCost} of upgradeData.spells) {
                    logger.debug('spell upgrade', {id, gainMinDmg, gainMaxDmg, gainMinStructureDmg, newMinDmg, newMaxDmg, gainPowerCost});

                    const oldSpell = previousUpgrade.spells[id - 1_000_000];
                    if (!oldSpell) {
                        continue;
                    }
                    logger.debug({oldSpell});
                    const {minDmg: currentMinDmg, maxDmg: currentMaxDmg, minStructureDmg: currentMinStructureDmg, spell: currentSpell} = Object.values(spellData).find(v => v.spell.Id === id);

                    const upgradeMin = gainMinDmg * (oldSpell.type === SpellType.AutoCast ? squadSize : 1);
                    if (gainMinDmg && Math.round(oldSpell.minDmg + upgradeMin) !== currentMinDmg) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'gainMinDmg', oldValue: oldSpell.minDmg, newValue: newMinDmg, upgradeValue: upgradeMin}});
                        if (![2001600, 2001604, 1001238, 1001474].includes(cardId)) throw 1; // known incorrect upgrade displays: infected tower, sunreaver
                    }

                    const upgradeMax = gainMaxDmg * (oldSpell.type === SpellType.AutoCast ? squadSize : 1);
                    if (gainMaxDmg && Math.round(oldSpell.maxDmg + upgradeMax) !== currentMaxDmg) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'gainMaxDmg', oldValue: oldSpell.maxDmg, newValue: newMaxDmg, upgradeValue: upgradeMax}});
                    }

                    if (gainMinStructureDmg && currentMinStructureDmg) {
                        if (currentMinStructureDmg !== Math.round(oldSpell.minStructureDmg + gainMinStructureDmg)) {
                            diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'gainMinStructureDmg', oldValue: oldSpell.minStructureDmg, newValue: currentMinStructureDmg, upgradeValue: gainMinStructureDmg}});
                        }
                    }

                    if (gainPowerCost) {
                        const currentPowerCost = currentSpell.ProductionPower;
                        if (gainPowerCost !== Math.round(oldSpell.spell.ProductionPower - currentPowerCost)) {
                            diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'powerCost', oldValue: oldSpell.spell.ProductionPower, newValue: currentPowerCost, upgradeValue: gainPowerCost}});
                        }
                    }
                }
            }

            processed.push({id: cardId, name: cardName});
            previousUpgrade = result;
        }
    }
} catch (e) {
    logger.error(e);
}

const withoutTypeEntry = ({type, ...content}: Diagnostic) => content;
const prettifyDiagnostic = (diagnostic: DiagnosticContainer) => `${diagnostic.card.name} (id:${diagnostic.card.id}) -> ${diagnostic.diag.type} ${JSON.stringify(withoutTypeEntry(diagnostic.diag))}`;

const countByType = (diagnostics: DiagnosticContainer[]) => {
    const res: {[key: string]: number;} = Object.values(DiagnosticType).reduce((aggregate, v) => ({...aggregate, [v]: 0}), {});
    for (const diagnostic of diagnostics) {
        res[diagnostic.diag.type] = (res[diagnostic.diag.type] ?? 0) + 1;
    }
    return res;
};

diagnostics.filter(d => d.diag.type === DiagnosticType.UpgradeMismatch).forEach(d => logger.warn(prettifyDiagnostic(d)));
//diagnostics.forEach(d => logger.warn(prettifyDiagnostic(d)));

logger.warn(`${diagnostics.length} diagnostics`);
//okayList.forEach(o => logger.debug(`OKAY ${o.name} (id:${o.id})`));
logger.info(`${processed.length} cards processed`);

logger.info(countByType(diagnostics));

console.timeEnd('elapsed');
