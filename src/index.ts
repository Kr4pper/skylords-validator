import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType, DiagnosticContainer, DiagnosticType, Diagnostic, CardIds, PROJECTILE_CHAIN_IDS, SPELL_GAIN_ABILITY_IDS, Building, SPELL_DMG_ABILITY_REF_IDS} from './api';
import {loadGameData, loadLanguageTable, logger} from './util';

const dbPath = process.argv[3];
if (!existsSync(dbPath)) {
    throw new Error(`Invalid db path provided: ${dbPath}`);
}

const cards = loadGameData<Card>(dbPath, GameDataTableType.Card);
const cardDescriptions = loadGameData<CardDescription>(dbPath, GameDataTableType.CardDescription);
const squads = loadGameData<Squad>(dbPath, GameDataTableType.Squad);
const buildings = loadGameData<Building>(dbPath, GameDataTableType.Building);
const units = loadGameData<Unit>(dbPath, GameDataTableType.Unit);
const modes = loadGameData<Mode>(dbPath, GameDataTableType.Mode);
const spells = loadGameData<Spell>(dbPath, GameDataTableType.Spell);
const spellDescriptions = loadGameData<SpellDescription>(dbPath, GameDataTableType.SpellDescription);
const spellTranslations = loadLanguageTable<SpellTranslation>(dbPath, LanguageTableType.Spell);
const projectiles = loadGameData<Projectile>(dbPath, GameDataTableType.Projectile);
const abilities = loadGameData<Ability>(dbPath, GameDataTableType.Ability);

const toU0 = (id: number) => {
    while (id > 1_000_000) id -= 1_000_000;
    return id;
};

const toProcess = Object.values(playerCards);
//const toProcess = [{U0: playerCards.RocketTower.U0}];
//const toProcess = [playerCards.GrimBahirANature];

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
        if (BLACKLIST.includes(upgrades.U0 % 1_000_000)) {
            logger.debug('blacklisted card detected');
            continue;
        }

        logger.debug(upgrades);
        const cardName = cardDescriptions.get(upgrades.U0).Name;
        logger.info('Processing', cardName);

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

            const spellIds = getRelevantSpellIds(card, mode);
            logger.debug({spellIds});

            // try to find the "main" spell instead
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

                    // try going via projectile
                    const maybeProjectile = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.Projectile)?.Value;
                    if (maybeProjectile) {
                        return getProjectileDmg(projectiles.get(maybeProjectile));
                    }

                    // try going via ability
                    logger.debug('trying to find direct dmg ability');

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

            const expectedDp20 = minDmg && maxDmg && attackRate ? squadSize * (minDmg + maxDmg) / 2 * 20 / attackRate * 1000 : undefined;
            const expectedDp20RoundedTo5 = expectedDp20 ? Math.round(5 * Math.round(expectedDp20 / 5)) : undefined;
            const result = {cardName, cardId, upgrade: Math.round(cardId / 1_000_000), listedDp20, listedHealth, attackRate, minDmg, maxDmg, expectedDp20, expectedDp20RoundedTo5, squadSize};
            logger.debug(result);


            if (expectedDp20RoundedTo5 && listedDp20 !== expectedDp20RoundedTo5) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.Dp20Mismatch, listedDp20, expectedDp20: expectedDp20RoundedTo5, attackRate}});
                diagIssued = true;
            }

            if (!diagIssued) {
                okayList.push({id: cardId, name: cardName});
            }
        }
    }
} catch (e) {
    logger.error(e);
}

const withoutTypeEntry = ({type, ...content}: Diagnostic) => content;
const prettifyDiagnostic = (diagnostic: DiagnosticContainer) => `${diagnostic.card.name} (id:${diagnostic.card.id}) -> ${diagnostic.diag.type} ${JSON.stringify(withoutTypeEntry(diagnostic.diag))}`;

diagnostics.filter(d => d.diag.type === DiagnosticType.MultipleSquadModesFound).forEach(d => logger.warn(prettifyDiagnostic(d)));
//diagnostics.forEach(d => logger.warn(prettifyDiagnostic(d)));

logger.warn(`${diagnostics.length} diagnostics`);
//okayList.forEach(o => logger.debug(`OKAY ${o.name} (id:${o.id})`));
logger.info(`${okayList.length} cards okay`);
