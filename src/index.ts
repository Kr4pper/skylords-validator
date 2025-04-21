import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType, DiagnosticContainer, DiagnosticType, Diagnostic, CardIds, PROJECTILE_CHAIN_IDS, SPELL_GAINED_ABILITY_IDS} from './api';
import {loadGameData, loadLanguageTable, logger} from './util';

const dbPath = process.argv[3];
if (!existsSync(dbPath)) {
    throw new Error(`Invalid db path provided: ${dbPath}`);
}

const cards = loadGameData<Card>(dbPath, GameDataTableType.Card);
const cardDescriptions = loadGameData<CardDescription>(dbPath, GameDataTableType.CardDescription);
const squads = loadGameData<Squad>(dbPath, GameDataTableType.Squad);
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
//const toProcess = [{U0: playerCards.EvilEye.U0}];
//const toProcess = [playerCards.GiantWyrm];

const diagnostics: DiagnosticContainer[] = [];
const okayList: {id: CardIds, name: string;}[] = [];
const BLACKLIST = [
    playerCards.CorsairANature.U0,
    playerCards.CorsairAShadow.U0,
    playerCards.LostSpiritShipAFire.U0,
    playerCards.LostSpiritShipANature.U0,
    playerCards.Molt.U0,
    playerCards.Hellhound.U0,
    playerCards.Devourer.U0,
];

try {
    for (const upgrades of toProcess) {
        if (BLACKLIST.includes(upgrades.U0 % 1_000_000)) {
            logger.debug('blacklisted card detected');
            diagnostics.push({card: {id: null, name: null}, diag: {type: DiagnosticType.UnsupportedEntity, entity: JSON.stringify(upgrades)}});
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

            if (card.Type === CardType.Building) {
                logger.debug('building detected, aborting');
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: 'building'}});
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
             * card -> building by DBEntityId [hp]  -> mode -> spell [cast,resolve,recast] -> parameter -> spell -> parameter [duration?,dmg,combined dmg]
             */

            const squad = squads.get(card.DBEntityId);
            logger.debug({squad});

            const squadSize = squad.SquadMembers[0].Count;
            const squadUnit = units.get(squad.SquadMembers[0].UnitId); // might be wrong for mixed-unit squads
            logger.debug({squadUnit});

            const listedHealth = squadUnit.Health * squadSize;
            const listedDp20 = squadUnit.Archive.Damage * squadSize;
            logger.debug({listedDp20, listedHealth});

            if (listedDp20 === 0) {
                logger.debug('card is not an attacker');
                okayList.push({id: cardId, name: cardName});
                continue;
            }

            if (squad.ModeIds.length !== 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleSquadModesFound, modeIds: squad.ModeIds}});
                continue;
            }

            const squadMode = modes.get(squad.ModeIds[0]); // might be wrong mode -> kobold engineer
            logger.debug({squadMode});

            if (squadMode.ModeUnitSpells.length !== 1) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.MultipleModeSpellsFound, spellIds: squadMode.ModeUnitSpells}});
                continue;
            }

            const modeUnitSpell = spells.get(squadMode.ModeUnitSpells[0]); // might need to find the "main" spell
            logger.debug({modeUnitSpell});

            if (!modeUnitSpell) {
                logger.debug('non-ranged unit detected, aborting');
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.UnsupportedEntity, entity: 'melee unit'}});
                continue;
            }

            const attackRate = modeUnitSpell.CastSteps + Math.max(modeUnitSpell.ResolveSteps, modeUnitSpell.RecastSteps); // TODO might be incomplete, AnimationTagId relevant?
            logger.debug({attackRate});

            const spellName = spellDescriptions.get(toU0(modeUnitSpell.Id)).Name; // U1+ do not have descriptions
            logger.debug({spellName});

            const tryScrapeAttackRate = () => {
                try {
                    const spellTranslation = spellTranslations.get(modeUnitSpell.Id);
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

            const getDmgRange = (modeUnitSpell: Spell): [number, number] => {
                // try going via projectile -> spell -> ability
                try {
                    logger.debug('trying to find projectile');
                    const spellProjectile = projectiles.get(modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.Projectile).Value);
                    logger.debug({spellProjectile});
                    logger.debug({C: spellProjectile.ParametersContainer.Parameters});

                    if (spellProjectile.ProjectileLine === 60) {
                        logger.debug('chaining projectile detected');
                        const chainSpellIds = spellProjectile.ParametersContainer.Parameters.filter(({Id}) => PROJECTILE_CHAIN_IDS.includes(Id)).reduce((ids, {Value}) => [...ids, Value], []);
                        logger.debug({chainSpellIds});

                        const chainDmg = chainSpellIds.map(id => spells.get(id).ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value);
                        logger.debug({chainDmg});

                        const total = chainDmg.reduce((sum, v) => sum + v, 0);
                        return [total, total];
                    }

                    const projectileSpell = spells.get(spellProjectile.TargetSpellId);
                    logger.debug({projectileSpell});
                    logger.debug(projectileSpell.ParametersContainer.Parameters);

                    const dmgAgainstFigures = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures);
                    if (dmgAgainstFigures) {
                        return [dmgAgainstFigures.Value, dmgAgainstFigures.Value];
                    }

                    const gainedAttackAbilities = projectileSpell.ParametersContainer.Parameters.filter(p => SPELL_GAINED_ABILITY_IDS.includes(p.Id) && p.Value);
                    logger.debug({gainedAttackAbilities});

                    for (let i = 0; i < gainedAttackAbilities.length; i++) {
                        try {
                            const ability = abilities.get(gainedAttackAbilities[i].Value);
                            logger.debug('ability parameters', ability.ParametersContainer.Parameters);
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
                    const dmgAbility = abilities.get(modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityToGain).Value);
                    if (dmgAbility) {
                        const parameters = dmgAbility.ParametersContainer.Parameters;
                        logger.debug('ability parameters', parameters);
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
                    const flameThrowerAbility = abilities.get(modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.FlameThrower).Value);
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
                    const dmg = modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures).Value;
                    return [dmg, dmg]; // TODO implement max dmg
                } catch (err) {
                    logger.debug('no dmg properties in spell found');
                }

                // try resolving suicide attack
                try {
                    logger.debug('trying to find suicide attack spell');
                    const spell = spells.get(modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.SuicideBomb).Value);
                    const parameters = spell.ParametersContainer.Parameters;
                    logger.debug({spell});
                    logger.debug('spell parameters', parameters);

                    return getDmgRange(spell);

                } catch (err) {
                    logger.debug('could not resolve suicide attack');
                }

                // try resolving shriek attack 
                const poisonInitialContainer = modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.PoisonInitialDmgSpell);
                if (poisonInitialContainer) {
                    logger.debug('trying to resolve shriek dmg spell');
                    const spell = spells.get(poisonInitialContainer.Value);
                    logger.debug({spell});
                    logger.debug({C: spell.ParametersContainer.Parameters});

                    return getDmgRange(spell);
                }

                // try resolving ability on target
                const abilityOnTarget = modeUnitSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityOnTarget);
                if (abilityOnTarget) {
                    logger.debug('trying to resolve ability on target');
                    const ability = abilities.get(abilityOnTarget.Value);
                    logger.debug({ability});
                    logger.debug({C: ability.ParametersContainer.Parameters});

                    const dmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.Damage).Value;
                    const delaySteps = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DelaySteps).Value; // take this into account here?
                    return [dmg, dmg];
                }

                throw new Error('could not resolve damage');
            };

            logger.debug({C: modeUnitSpell.ParametersContainer.Parameters});
            const [minDmg, maxDmg] = getDmgRange(modeUnitSpell);
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
            const result = {name: cardName, upgrade: Math.round(cardId / 1_000_000), listedDp20, listedHealth, attackRate, minDmg, maxDmg, expectedDp20: expectedDp20RoundedTo5, squadSize};
            logger.debug(result);

            if (listedDp20 !== expectedDp20RoundedTo5) {
                diagnostics.push({card: {id: cardId, name: cardName}, diag: {type: DiagnosticType.Dp20Mismatch, listedDp20, expectedDp20: expectedDp20RoundedTo5}});
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

//diagnostics.forEach(d => logger.warn(prettifyDiagnostic(d)));
logger.warn(`${diagnostics.length} diagnostics`);

//okayList.forEach(o => logger.debug(`OKAY ${o.name} (id:${o.id})`));
logger.info(`${okayList.length} cards okay`);
