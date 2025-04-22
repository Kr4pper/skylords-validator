import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType, DiagnosticContainer, DiagnosticType, Diagnostic, CardIds, PROJECTILE_CHAIN_IDS, SPELL_GAIN_ABILITY_IDS, Building, SPELL_DMG_ABILITY_REF_IDS, SpellLoca, LocaTableType, ModeLoca, ModeLocaType} from './api';
import {loadGameData, loadLanguageTable, loadLocaTable, logger} from './util';
import {CardLocaType} from './api/card-translation';

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
const modeLoca = loadLocaTable<ModeLoca>(dbPath, LocaTableType.Mode);
const spells = loadGameData<Spell>(dbPath, GameDataTableType.Spell);
const spellDescriptions = loadGameData<SpellDescription>(dbPath, GameDataTableType.SpellDescription);
const spellTranslations = loadLanguageTable<SpellTranslation>(dbPath, LanguageTableType.Spell);
const spellLoca = loadLocaTable<SpellLoca>(dbPath, LocaTableType.Spell);
const projectiles = loadGameData<Projectile>(dbPath, GameDataTableType.Projectile);
const abilities = loadGameData<Ability>(dbPath, GameDataTableType.Ability);

const toU0 = (id: number) => {
    while (id > 1_000_000) id -= 1_000_000;
    return id;
};

const toProcess = Object.values(playerCards);
//const toProcess = [{U0: playerCards.RocketTower.U0}];
//const toProcess = [playerCards.BanditLauncherAShadow];

const diagnostics: DiagnosticContainer[] = [];
const okayList: {id: CardIds, name: string;}[] = [];
const BLACKLIST = [
    playerCards.CorsairANature.U0,
    playerCards.CorsairAShadow.U0,
    playerCards.LostSpiritShipAFire.U0,
    playerCards.LostSpiritShipANature.U0,
    playerCards.Spitfire.U0,
    playerCards.PhaseTower.U0, // uses an ability instead of a spell to deal dmg
    playerCards.Mindweaver.U0, // uses an ability instead of a spell to deal dmg
    playerCards.Molt.U0,
    playerCards.Hellhound.U0,
    playerCards.Devourer.U0,
];

try {
    for (const upgrades of toProcess) {
        let previousUpgrade = null;

        if (BLACKLIST.includes(upgrades.U0 % 1_000_000)) {
            logger.debug('blacklisted card detected');
            continue;
        }

        logger.debug(upgrades);
        const cardName = cardDescriptions.get(upgrades.U0).Name;
        logger.info(`Processing ${cardName} (id:${upgrades.U0})`);

        for (const cardId of Object.values(upgrades)) {
            let diagIssued = false;

            const card = cards.get(cardId);
            logger.debug({card});

            if (card.Type === CardType.Spell) {
                logger.debug('spell detected, aborting');
                okayList.push({id: cardId, name: cardName});
                continue;
            }

            if (card.IsPromo && (cardId < 2_000_000 || cardId > 3_000_000)) {
                logger.debug('promo card with upgrade!=2 detected, aborting');
                okayList.push({id: cardId, name: cardName});
                continue;
            }


            /**
             * Squads
             * card -> squad by DBEntityId [dmg,hp] -> mode -> spell [cast,resolve,recast] -> parameter -> (projectile if relevant ->) spell -> parameter [dmg,combined dmg]
             */

            /**
             * Buildings
             * card [dmg] -> building by DBEntityId [hp]  -> mode -> spell [cast,resolve,recast] -> parameter -> (projectile if relevant ->) spell -> parameter [duration?,dmg,combined dmg]
             */

            const resolveBasicData = (card: Card): {squadSize: number, listedDp20: number, listedHealth: number, modeIds: number[];} => {
                switch (card.Type) {
                    case CardType.Squad:
                        const squad = squads.get(card.DBEntityId);
                        logger.debug({squad});

                        const squadSize = squad.SquadMembers[0].Count;
                        const squadUnit = units.get(squad.SquadMembers[0].UnitId); // might be wrong for mixed-unit squads
                        logger.debug({squadUnit});

                        return {
                            squadSize,
                            listedDp20: Math.round(squadUnit.Archive.Damage * squadSize),
                            listedHealth: Math.round(squadUnit.Health * squadSize),
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

            if (listedDp20 === 0) {
                logger.debug('card is not an attacker');
                okayList.push({id: cardId, name: cardName});
                continue;
            }

            if (modeIds.length === 0) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: null}});
                continue;
            }

            // TODO try multiple modes instead until match? (kobold engineer)
            if (modeIds.length > 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleSquadModesFound, modeIds}});
                continue;
            }

            const mode = modes.get(modeIds[0]);
            logger.debug({mode});

            const getRelevantSpellIds = (card: Card, mode: Mode): number[] => {
                switch (card.Type) {
                    case CardType.Squad:
                        return mode.ModeUnitSpells;
                    case CardType.Building:
                        return mode.ModeSpells;
                    default:
                        throw new Error('unsupported card type');
                }
            };

            const spellIds = getRelevantSpellIds(card, mode).filter(id => (spells.get(id).Flags & 8) === 0); // exclude bit 3 = manual cast
            logger.debug({spellIds});

            if (spellIds.length > 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleModeSpellsFound, spellIds}});
                continue;
            }

            const getSpellData = (spellId: number): {attackRate: number, minDmg: number, maxDmg: number;} => {
                const modeSpell = spells.get(spellId);
                logger.debug({modeSpell});

                if (!modeSpell) {
                    logger.debug('non-ranged unit detected, aborting');
                    return {attackRate: undefined, minDmg: undefined, maxDmg: undefined};
                }

                const attackRate = modeSpell.CastSteps + Math.max(modeSpell.ResolveSteps, modeSpell.RecastSteps); // TODO might be incomplete, AnimationTagId relevant?
                logger.debug({attackRate});

                const spellName = spellDescriptions.get(toU0(modeSpell.Id)).Name; // U1+ do not have descriptions
                logger.debug({spellName});

                const getProjectileDmg = (projectile: Projectile): [number, number] => {
                    logger.debug({projectile});
                    logger.debug({C: projectile.ParametersContainer.Parameters});

                    if (projectile.ParametersContainer.Parameters.some(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id))) {
                        logger.debug('chaining projectile detected');
                        const chainSpellIds = projectile.ParametersContainer.Parameters.filter(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id)).reduce((ids, {Value}) => [...ids, Value], []);
                        logger.debug({chainSpellIds});

                        const chainDmg = chainSpellIds.map(id => spells.get(id).ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value);
                        logger.debug({chainDmg});

                        const total = chainDmg.reduce((sum, v) => sum + v, 0);
                        return [total, total];
                    }

                    const projectileSpell = spells.get(projectile.TargetSpellId);
                    return getSpellDmg(projectileSpell);
                };

                const getAbilityDmg = (ability: Ability): [number, number] => {
                    const parameters = ability.ParametersContainer.Parameters;
                    logger.debug('getAbilityDmg', ability.Id, parameters);

                    const minDmg = parameters.find(p => [AbilityParameterIds.DamageOnSingleUnit, AbilityParameterIds.DamagePerTarget].includes(p.Id))?.Value;
                    const maxDmg = parameters.find(p => [AbilityParameterIds.TotalCombinedDamage, AbilityParameterIds.TotalDamage].includes(p.Id))?.Value;
                    logger.debug({minDmg, maxDmg});
                    if (minDmg && maxDmg) {
                        logger.debug('returning min, max');
                        return [minDmg, maxDmg];
                    }

                    const spellToGive = parameters.find(p => p.Id === AbilityParameterIds.SpellToGive)?.Value;
                    if (spellToGive) {
                        logger.debug({spellToGive});
                        return getSpellDmg(spells.get(spellToGive));
                    }

                    const spellToCast = parameters.find(p => [AbilityParameterIds.SpellToCastAfterDelayOnUnit, AbilityParameterIds.SpellToCast].includes(p.Id) && p.Value)?.Value;
                    if (spellToCast) {
                        logger.debug({spellToCast});
                        return getSpellDmg(spells.get(spellToCast));
                    }

                    const startProjectileSpell = parameters.find(p => p.Id === AbilityParameterIds.StartProjectileSpell)?.Value;
                    if (startProjectileSpell) {
                        logger.debug({startProjectileSpell});
                        return getSpellDmg(spells.get(startProjectileSpell));
                    }

                    // flame thrower
                    const interval = parameters.find(p => p.Id === AbilityParameterIds.Interval)?.Value;
                    const dmgDamagePerInterval = parameters.find(p => p.Id === AbilityParameterIds.TotalDamagePerInterval)?.Value;
                    if (interval && dmgDamagePerInterval) {
                        logger.debug({interval, dmgDamagePerInterval});
                        return [dmgDamagePerInterval, dmgDamagePerInterval];
                    }

                    // beam dot
                    const dmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.Damage)?.Value;
                    const delaySteps = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DelaySteps)?.Value; // take this into account here?
                    if (dmg && delaySteps) {
                        logger.debug({dmg, delaySteps});
                        return [dmg, dmg];
                    }
                };

                const getSpellDmg = (spell: Spell): [number, number] => {
                    logger.debug('getSpellDmg', spell.Id);
                    logger.debug({spell});
                    logger.debug({C: spell.ParametersContainer.Parameters});

                    logger.debug('trying to find projectile');
                    const maybeProjectile = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.Projectile)?.Value;
                    if (maybeProjectile) {
                        return getProjectileDmg(projectiles.get(maybeProjectile));
                    }

                    logger.debug('trying to find dmg ability');
                    const maybeDmgAbilities = spell.ParametersContainer.Parameters.filter(p => SPELL_DMG_ABILITY_REF_IDS.includes(p.Id) && p.Value);
                    if (maybeDmgAbilities.length > 0) {
                        logger.debug({maybeDmgAbilities});

                        const resolved = maybeDmgAbilities.map(p => getAbilityDmg(abilities.get(p.Value)));
                        logger.debug({resolved});

                        const nonEmpty = resolved.filter(v => v);

                        // hack to return the beam dot part
                        if (nonEmpty.length === 2 && cardId % 1_000_000 === playerCards.EvilEye.U0) {
                            return nonEmpty[0];
                        }

                        if (nonEmpty.length > 1) {
                            throw new Error('more than one potential dmg ability');
                        }
                        if (nonEmpty.length === 1) {
                            return nonEmpty[0];
                        }
                    }

                    logger.debug('trying to find dmg properties in spell');
                    const dmg = spell.ParametersContainer.Parameters.find(p => [SpellParameterId.DamageAgainstFigures, SpellParameterId.DamageAgainstSquad].includes(p.Id) && p.Value)?.Value;
                    if (dmg) {
                        return [dmg, dmg]; // TODO also look for max dmg here?
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
                        logger.debug({C: spell.ParametersContainer.Parameters});

                        return getSpellDmg(poisonInitialDmgSpell);
                    }

                    throw new Error('could not resolve damage in ' + cardName + ' spell id is ' + spell.Id);
                };

                logger.debug({C: modeSpell.ParametersContainer.Parameters});
                const [minDmg, maxDmg] = getSpellDmg(modeSpell);
                logger.debug({minDmg, maxDmg});

                const tryScrapeAttackRate = () => {
                    try {
                        const spellTranslation = spellTranslations.get(modeSpell.Id);
                        logger.debug({spellTranslation});
                        const atkRateContainer = spellTranslation.map(line => new RegExp(/every (\d+) seconds/i).exec(line.Text)).find(v => !!v);
                        return +atkRateContainer[1] * 1000;
                    } catch (err) {
                        logger.trace('Scraping error', err);
                        return null;
                    }
                };
                const scrapedAttackRate = tryScrapeAttackRate();
                logger.debug({scrapedAttackRate});

                if (scrapedAttackRate) {
                    diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.HardCodedAttackRate, scrapedAttackRate, attackRate}});
                    diagIssued = true;
                }

                return {attackRate, minDmg, maxDmg};
            };

            const {attackRate, minDmg, maxDmg} = getSpellData(spellIds[0]);

            /**
             * Validations:
             *  x listed dp20 = real dp20 -> accept both exact and rounded to 5 matches?
             *  x hard coded atk rate
             *  upgrade text = real upgrade values
             *  min dmg on unit = min dmg on structure (maybe?)
            */

            /**
             *  card id -> card translation for text templates
             *  spell delta -> spell loca for values
             *  {
                    Id: 3001254,
                    Values: [
                        { Id: 6, Text: '615', Unknown1: false },
                        { Id: 7, Text: '925', Unknown1: false },
                        { Id: 14, Text: '10', Unknown1: false },
                        { Id: 99, Text: '55', Unknown1: true },
                        { Id: 100, Text: '85', Unknown1: true }
                    ]
                }
             *  ability delta 1002038 -> used to represent hp value change
                ability delta 1002039 -> used to represent dmg value change
                index mode loca (9201) with ability id for value

             *  compare with gathered data about lower upgrade tier
             */

            const getUpgradeData = (cardId: CardIds): {health?: number, dp20?: number;} => {
                const translations = cardTranslations.get(cardId);
                logger.debug({translations});

                const upgradeTemplate = translations.find(t => t.LocaType === CardLocaType.UpgradeTemplate);
                if (!upgradeTemplate) {
                    return {};
                }

                const EXTRACT_HP_UPGRADE = new RegExp('<FORMAT TAG="card_ability_name_style"><VAR NAME="ability_name" ID="\\d002038"></FORMAT TAG> <FORMAT TAG="delta_card_text_style"><VAR NAME="mode_delta_bonus" ID="(\\d+)"></FORMAT TAG>', 'i');
                const hpMatch = EXTRACT_HP_UPGRADE.exec(upgradeTemplate.Text);
                logger.debug({hpMatch});
                if (hpMatch) {
                    const loca = modeLoca.get(+hpMatch[1]);
                    logger.debug({L: loca.Values});
                    const delta = loca.Values.find(l => [ModeLocaType.HealthModifier, ModeLocaType.HealthModifier2].includes(l.Id)).Text;
                    return {health: +delta};
                }


                const EXTRACT_DP20_UPGRADE = new RegExp('<FORMAT TAG="card_ability_name_style"><VAR NAME="ability_name" ID="\\d002039"></FORMAT TAG> <FORMAT TAG="delta_card_text_style"><VAR NAME="mode_delta_bonus" ID="(\\d+)"></FORMAT TAG>', 'i');
                const dp20Match = EXTRACT_DP20_UPGRADE.exec(upgradeTemplate.Text);
                logger.debug({dp20Match});
                if (dp20Match) {
                    const loca = modeLoca.get(+dp20Match[1]);
                    if (loca) { // make sure typos in mode delta ID dont cause crash 
                        logger.debug({L: loca.Values});
                        const delta = loca.Values.find(l => [ModeLocaType.Dp20Modifier, ModeLocaType.Dp20Modifier2].includes(l.Id)).Text;
                        return {dp20: +delta};
                    }
                }
            };

            const upgradeData = getUpgradeData(cardId);
            logger.debug({upgradeData});

            const expectedDp20 = minDmg && maxDmg && attackRate ? squadSize * (minDmg + maxDmg) / 2 * 20 / attackRate * 1000 : undefined;
            const expectedDp20RoundedTo5 = expectedDp20 ? Math.round(5 * Math.round(expectedDp20 / 5)) : undefined;
            const result = {cardName, cardId, upgrade: Math.round(cardId / 1_000_000), upgradeData, listedDp20, listedHealth, attackRate, minDmg, maxDmg, expectedDp20, expectedDp20RoundedTo5, squadSize};
            logger.debug(result);

            if (previousUpgrade && upgradeData) {
                if (upgradeData.dp20) {
                    logger.debug('dp20 upgrade sanity check', upgradeData.dp20);
                    const oldValue = previousUpgrade.listedDp20;
                    logger.debug({oldValue, listedDp20, upgrade: upgradeData.dp20, squadSize});
                    if (Math.round(oldValue + squadSize * upgradeData.dp20) !== listedDp20) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'dp20', oldValue, newValue: listedDp20, upgradeValue: upgradeData.dp20}});
                        diagIssued = true;
                    }
                }

                if (upgradeData.health) {
                    logger.debug('health upgrade sanity check', upgradeData.health);
                    const oldValue = previousUpgrade.listedHealth;
                    logger.debug({oldValue, listedHealth, upgrade: upgradeData.health, squadSize});
                    if (Math.round(oldValue + squadSize * upgradeData.health) !== listedHealth) {
                        diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UpgradeMismatch, property: 'health', oldValue, newValue: listedHealth, upgradeValue: upgradeData.health}});
                        diagIssued = true;
                    }
                }
            }

            if (expectedDp20RoundedTo5 && listedDp20 !== expectedDp20RoundedTo5) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.Dp20Mismatch, listedDp20, expectedDp20: expectedDp20RoundedTo5, attackRate}});
                diagIssued = true;
            }

            if (!diagIssued) {
                okayList.push({id: cardId, name: cardName});
            }

            previousUpgrade = result;
        }
    }
} catch (e) {
    logger.error(e);
}

const withoutTypeEntry = ({type, ...content}: Diagnostic) => content;
const prettifyDiagnostic = (diagnostic: DiagnosticContainer) => `${diagnostic.card.name} (id:${diagnostic.card.id}) -> ${diagnostic.diag.type} ${JSON.stringify(withoutTypeEntry(diagnostic.diag))}`;

const countByType = (diagnostics: DiagnosticContainer[]) => {
    const res: {[key: string]: number;} = {};
    for (const diagnostic of diagnostics) {
        res[diagnostic.diag.type] = (res[diagnostic.diag.type] ?? 0) + 1;
    }
    return res;
};

diagnostics.filter(d => d.diag.type === DiagnosticType.MultipleSquadModesFound).forEach(d => logger.warn(prettifyDiagnostic(d)));
//diagnostics.forEach(d => logger.warn(prettifyDiagnostic(d)));

logger.warn(`${diagnostics.length} diagnostics`);
//okayList.forEach(o => logger.debug(`OKAY ${o.name} (id:${o.id})`));
logger.info(`${okayList.length} cards okay`);

logger.info(countByType(diagnostics));
