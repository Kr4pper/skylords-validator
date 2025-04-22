import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType, DiagnosticContainer, DiagnosticType, Diagnostic, CardIds, PROJECTILE_CHAIN_IDS, SPELL_GAINED_ABILITY_IDS, Building} from './api';
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
//const toProcess = [playerCards.RocketTower];

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
            // diagnostics.push({card: {id: null, name: null}, diag: {type: DiagnosticType.UnsupportedEntity, entity: JSON.stringify(upgrades)}});
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

            if (modeIds.length === 0) { // includes melee units
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: 'melee'}});
                continue;
            }

            if (modeIds.length > 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleSquadModesFound, modeIds}});
                continue;
            }

            const mode = modes.get(modeIds[0]); // might be wrong mode -> kobold engineer?
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

            if (spellIds.length !== 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleModeSpellsFound, spellIds}});
                continue;
            }

            const modeSpell = spells.get(spellIds[0]); // might need to find the "main" spell
            logger.debug({modeSpell});

            if (!modeSpell) {
                logger.debug('non-ranged unit detected, aborting');
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: 'no ranged attack'}});
                continue;
            }

            const attackRate = modeSpell.CastSteps + Math.max(modeSpell.ResolveSteps, modeSpell.RecastSteps); // TODO might be incomplete, AnimationTagId relevant?
            logger.debug({attackRate});

            const spellName = spellDescriptions.get(toU0(modeSpell.Id)).Name; // U1+ do not have descriptions
            logger.debug({spellName});

            const tryScrapeAttackRate = () => {
                try {
                    const spellTranslation = spellTranslations.get(modeSpell.Id);
                    logger.debug({spellTranslation});
                    const atkRateContainer = spellTranslation.map(line => new RegExp(/every (\d+) seconds/i).exec(line.Text)).find(v => !!v);
                    const scrapedAtkCooldown = +atkRateContainer[1];

                    diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.HardCodedAttackRate, translationText: atkRateContainer[0]}});
                    diagIssued = true;

                    return scrapedAtkCooldown * 1000;
                } catch (err) {
                    logger.trace('Scraping error', err);
                    return null;
                }
            };
            const scrapedAttackRate = tryScrapeAttackRate();
            logger.debug({scrapedAttackRate});

            const getDmgRange = (spell: Spell): [number, number] => {
                // try going via projectile -> spell -> ability
                try {
                    logger.debug('trying to find projectile');
                    const spellProjectile = projectiles.get(spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.Projectile).Value);
                    logger.debug({spellProjectile});
                    logger.debug({C: spellProjectile.ParametersContainer.Parameters});

                    if (spellProjectile.ParametersContainer.Parameters.some(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id))) {
                        logger.debug('chaining projectile detected');
                        const chainSpellIds = spellProjectile.ParametersContainer.Parameters.filter(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id)).reduce((ids, {Value}) => [...ids, Value], []);
                        logger.debug({chainSpellIds});

                        const chainDmg = chainSpellIds.map(id => spells.get(id).ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value);
                        logger.debug({chainDmg});

                        const total = chainDmg.reduce((sum, v) => sum + v, 0);
                        return [total, total];
                    }

                    const projectileSpell = spells.get(spellProjectile.TargetSpellId);
                    logger.debug(1, {projectileSpell});
                    logger.debug({C: projectileSpell.ParametersContainer.Parameters});

                    const dmgAgainstFiguresC = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures);
                    const dmgAgainstFigures = (dmgAgainstFiguresC && dmgAgainstFiguresC.Value) || 0;
                    const dmgAgainstSquadC = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstSquad);
                    const dmgAgainstSquad = (dmgAgainstSquadC && dmgAgainstSquadC.Value) || 0;
                    const relevantDmg = Math.max(dmgAgainstFigures, dmgAgainstSquad);
                    if (relevantDmg) {
                        return [relevantDmg, relevantDmg];
                    }

                    const gainedAttackAbilities = projectileSpell.ParametersContainer.Parameters.filter(p => SPELL_GAINED_ABILITY_IDS.includes(p.Id) && p.Value);
                    logger.debug({gainedAttackAbilities});

                    for (let i = 0; i < gainedAttackAbilities.length; i++) {
                        try {
                            const ability = abilities.get(gainedAttackAbilities[i].Value);
                            logger.debug('ability parameters', ability.Id, ability.ParametersContainer.Parameters);
                            const minDmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DamageOnSingleUnit).Value;
                            const maxDmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.TotalCombinedDamage).Value;
                            return [minDmg, maxDmg];
                        } catch (err) {
                            logger.debug('no match for gained attack', gainedAttackAbilities[i]);
                        }
                    }

                    // try resolving poison initial dmg attack
                    const poisonInitialContainer = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.PoisonInitialDmgSpell);
                    if (poisonInitialContainer) {
                        logger.debug('trying to find poison initial dmg spell');
                        const spell = spells.get(poisonInitialContainer.Value);
                        logger.debug({spell});
                        logger.debug({C: spell.ParametersContainer.Parameters});

                        const gainedAbility = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityToGain);
                        if (gainedAbility) {
                            return getDmgRange(spell);
                        }

                        const dmg = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value;
                        return [dmg, dmg];
                    }
                } catch (err) {
                    logger.debug('no projectile -> spell -> ability resolved', err);
                }

                // try going via ability
                try {
                    logger.debug('trying to find direct dmg ability');
                    const dmgAbility = abilities.get(spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityToGain).Value);
                    if (dmgAbility) {
                        const parameters = dmgAbility.ParametersContainer.Parameters;
                        logger.debug('ability parameters', dmgAbility.Id, parameters);

                        const spellToGive = parameters.find(p => p.Id === AbilityParameterIds.SpellToGive);
                        if (spellToGive) {
                            logger.debug({spellToGive});
                            return getDmgRange(spells.get(spellToGive.Value));
                        }

                        const spellToCast = parameters.find(p => p.Id === AbilityParameterIds.SpellToCastAfterDelayOnUnit);
                        if (spellToCast) {
                            logger.debug({spellToCast});
                            return getDmgRange(spells.get(spellToCast.Value));
                        }

                        const startProjectileSpell = parameters.find(p => p.Id === AbilityParameterIds.StartProjectileSpell);
                        if (startProjectileSpell) {
                            logger.debug({startProjectileSpell});
                            return getDmgRange(spells.get(startProjectileSpell.Value));
                        }

                        const minDmg = parameters.find(p => [AbilityParameterIds.DamageOnSingleUnit, AbilityParameterIds.DamagePerTarget].includes(p.Id)).Value;
                        const maxDmg = parameters.find(p => [AbilityParameterIds.TotalCombinedDamage, AbilityParameterIds.TotalDamage].includes(p.Id)).Value;
                        return [minDmg, maxDmg];
                    }
                } catch (err) {
                    logger.debug('no dmg ability found');
                }

                // try going via flamethrower
                try {
                    logger.debug('trying to find flamethrower dmg ability');
                    const flameThrowerAbility = abilities.get(spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.FlameThrower).Value);
                    if (flameThrowerAbility) {
                        const parameters = flameThrowerAbility.ParametersContainer.Parameters;
                        logger.debug('ability parameters', parameters);
                        const interval = parameters.find(p => p.Id === AbilityParameterIds.Interval).Value;
                        const dmgDamagePerInterval = parameters.find(p => p.Id === AbilityParameterIds.TotalDamagePerInterval).Value;
                        return [dmgDamagePerInterval, dmgDamagePerInterval]; // TODO integrate this better
                    }
                } catch (err) {
                    logger.debug('no dmg ability found');
                }

                // try going via dmg properties in spell
                try {
                    logger.debug('trying to find dmg properties in spell');
                    const dmg = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value;
                    return [dmg, dmg]; // TODO implement max dmg
                } catch (err) {
                    logger.debug('no dmg properties in spell found');
                }

                // try resolving suicide attack
                try {
                    logger.debug('trying to find suicide attack spell');
                    const suicideSpell = spells.get(spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.SuicideBomb).Value);
                    const parameters = suicideSpell.ParametersContainer.Parameters;
                    logger.debug({suicideSpell});
                    logger.debug('suicideSpell parameters', parameters);

                    return getDmgRange(suicideSpell);
                } catch (err) {
                    logger.debug('could not resolve suicide attack');
                }

                // try resolving shriek attack 
                const poisonInitialContainer = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.PoisonInitialDmgSpell);
                if (poisonInitialContainer) {
                    logger.debug('trying to resolve shriek dmg spell');
                    const spell = spells.get(poisonInitialContainer.Value);
                    logger.debug({spell});
                    logger.debug({C: spell.ParametersContainer.Parameters});

                    return getDmgRange(spell);
                }

                // try resolving ability on target
                const abilityOnTarget = spell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityOnTarget);
                if (abilityOnTarget) {
                    logger.debug('trying to resolve ability on target');
                    const ability = abilities.get(abilityOnTarget.Value);
                    logger.debug({ability});
                    logger.debug({C: ability.ParametersContainer.Parameters});

                    const dmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.Damage).Value;
                    const delaySteps = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DelaySteps).Value; // take this into account here?
                    const adjusted = dmg * attackRate / delaySteps;
                    return [adjusted, adjusted];
                }

                throw new Error('could not resolve damage');
            };

            logger.debug({C: modeSpell.ParametersContainer.Parameters});
            const [minDmg, maxDmg] = getDmgRange(modeSpell);
            logger.debug({minDmg, maxDmg});

            /**
             * Validations:
             *  x listed dp20 = real dp20 -> accept both exact and rounded to 5 matches?
             *  x hard coded atk rate
             *  listed atk cooldown = real attack cooldown
             *  upgrade text = real upgrade values
             *  min dmg on unit = min dmg on structure (maybe?)
             */

            /**
             * TODO
             * - try processing more cards
             */

            const expectedDp20 = squadSize * (minDmg + maxDmg) / 2 * 20 / attackRate * 1000;
            const expectedDp20RoundedTo5 = Math.round(5 * Math.round(expectedDp20 / 5));
            const result = {name: cardName, upgrade: Math.round(cardId / 1_000_000), listedDp20, listedHealth, attackRate, minDmg, maxDmg, expectedDp20, expectedDp20RoundedTo5, squadSize};
            logger.debug(result);

            if (listedDp20 !== expectedDp20RoundedTo5) {
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

//diagnostics.filter(d => d.diag.type === DiagnosticType.MultipleModeSpellsFound).forEach(d => logger.warn(prettifyDiagnostic(d)));
//diagnostics.forEach(d => logger.warn(prettifyDiagnostic(d)));

logger.warn(`${diagnostics.length} diagnostics`);
//okayList.forEach(o => logger.debug(`OKAY ${o.name} (id:${o.id})`));
logger.info(`${okayList.length} cards okay`);
