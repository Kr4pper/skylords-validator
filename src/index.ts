import {existsSync} from 'fs';
import {Ability, AbilityParameterIds, playerCards, Card, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit, CardDescription, LanguageTableType, SpellParameterId, CardType} from './api';
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

//const toProcess = Object.values(playerCards);
const toProcess = [{U0: playerCards.CommandosAShadow.U0}];

for (const upgrades of toProcess) {
    const cardName = cardDescriptions.get(upgrades.U0).Name;
    logger.info('Processing', cardName);

    for (const upgrade of Object.values(upgrades)) {
        const card = cards.get(upgrade);
        logger.debug({card});

        if (card.Type === CardType.Spell) {
            logger.debug('spell detected, aborting');
            continue;
        }

        /**
         * Squads
         * card -> squad by DBEntityId [dmg,hp] -> mode -> spell [cast,resolve,recast] -> parameter -> projectile -> spell -> parameter [dmg,combined dmg]
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

        const squadMode = modes.get(squad.ModeIds[0]); // might be wrong mode
        logger.debug({squadMode});

        const modeSpell = spells.get(squadMode.ModeUnitSpells[0]); // might need to find the "main" spell
        logger.debug({modeSpell});

        if (!modeSpell) {
            logger.debug('non-ranged unit detected, aborting');
            continue;
        }

        const attackRate = modeSpell.CastSteps + Math.max(modeSpell.ResolveSteps, modeSpell.RecastSteps); // TODO might be incomplete, AnimationTagId relevant?
        logger.debug({attackRate});

        const spellName = spellDescriptions.get(toU0(modeSpell.Id)).Name; // U1+ do not have descriptions
        logger.debug({spellName});

        /*
        const tryScrapeAttackRate = () => {
            try {
                const spellTranslation = spellTranslations.get(modeSpell.Id);
                logger.debug({spellTranslation});
                const scrapedAtkCooldown = +spellTranslation.map(line => new RegExp(/every (\d+) seconds/i).exec(line.Text)).find(v => !!v)[1];
                return scrapedAtkCooldown * 1000;
            } catch (err) {
                logger.debug('Scraping error', err);
                return null;
            }
        };
        const scrapedAttackRate = tryScrapeAttackRate();
        logger.debug({scrapedAttackRate});
        */

        const spellProjectile = projectiles.get(modeSpell.ParametersContainer.Parameters[0].Value);
        logger.debug({spellProjectile});

        const projectileSpell = spells.get(spellProjectile.TargetSpellId);
        logger.debug({projectileSpell});
        logger.debug(projectileSpell.ParametersContainer.Parameters);

        const getDmgRange = (): [number, number] => {
            const dmgAgainstFigures = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.DamageAgainstFigures);
            if (dmgAgainstFigures) {
                return [dmgAgainstFigures.Value, dmgAgainstFigures.Value];
            }

            const gainedAttackAbility = projectileSpell.ParametersContainer.Parameters.find(p => p.Id === SpellParameterId.AbilityToGain);
            if (gainedAttackAbility) {
                const ability = abilities.get(gainedAttackAbility.Value);
                logger.debug('ability parameters', ability.ParametersContainer.Parameters);
                const minDmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DamageOnSingleUnit).Value;
                const maxDmg = ability.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.TotalCombinedDamage).Value;
                return [minDmg, maxDmg];
            }

            throw new Error('unsupported dmg type');
        };
        const [minDmg, maxDmg] = getDmgRange();

        /**
         * Validations:
         *  listed dp20 = real dp20
         *  listed atk cooldown = real attack cooldown
         *  upgrade text = real upgrade values
         *  min dmg on unit = min dmg on structure (maybe?)
         */

        /**
         * TODO
         * - try processing more cards
         */

        const realDp20 = squadSize * (minDmg + maxDmg) / 2 * 20 / attackRate * 1000;
        const realDp20Rounded = 5 * Math.round(realDp20 / 5);
        const result = {name: cardName, upgrade: Math.round(upgrade / 1_000_000), listedDp20, listedHealth, attackRate, minDmg, maxDmg, realDp20Rounded};
        logger.debug(result);

        if (listedDp20 !== realDp20Rounded) {
            logger.warn(`Dp20 mismatch, got ${listedDp20} but expected ${realDp20Rounded}`);
            logger.warn(result);
        }
    }
}
