import {existsSync, readdirSync, readFileSync} from 'fs';
import {join} from 'path';
import {Ability, AbilityParameterIds, Card, CardIds, GameDataTableType, Mode, Projectile, Spell, SpellDescription, SpellTranslation, Squad, Unit} from './api';

const dbPath = process.argv[3];
if (!existsSync(dbPath)) {
    throw new Error(`Invalid db path provided: ${dbPath}`);
}
const getFilePathsByType = (path: string, type: GameDataTableType) => {
    const res: string[] = [];

    for (const file of readdirSync(path)) {
        if (file.startsWith(type.toString())) {
            res.push(join(path, file));
        }
    }

    return res;
};

const loadGameData = <T extends {Id: number;}>(db: string, type: GameDataTableType): Map<number, T> => {
    const dataTable = new Map<CardIds, T>();

    for (const filePath of getFilePathsByType(db, type)) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            dataTable.set(entity.Id, entity);
        }
    }

    return dataTable;
};

const loadSpellLines = <T extends {Id: number;}>(db: string, type: GameDataTableType): Map<number, T[]> => {
    const dataTable = new Map<number, T[]>();

    for (const filePath of getFilePathsByType(db, type)) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            const next = dataTable.get(entity.Id) ? [...dataTable.get(entity.Id), entity] : [entity];
            dataTable.set(entity.Id, next);
        }
    }

    return dataTable;
};

const cards = loadGameData<Card>(dbPath, GameDataTableType.Card);
const squads = loadGameData<Squad>(dbPath, GameDataTableType.Squad);
const units = loadGameData<Unit>(dbPath, GameDataTableType.Unit);
const modes = loadGameData<Mode>(dbPath, GameDataTableType.Mode);
const spells = loadGameData<Spell>(dbPath, GameDataTableType.Spell);
const spellDescriptions = loadGameData<SpellDescription>(dbPath, GameDataTableType.SpellDescription);
const spellTranslations = loadSpellLines<SpellTranslation>(dbPath, GameDataTableType.SpellTranslation);
const projectiles = loadGameData<Projectile>(dbPath, GameDataTableType.Projectile);
const abilities = loadGameData<Ability>(dbPath, GameDataTableType.Ability);

const card = cards.get(CardIds.GiantWyrmU0);
const cardSquad = squads.get(card.DBEntityId);
console.log({cardSquad});

const squadUnit = units.get(cardSquad.SquadMembers[0].UnitId); // would need to check for each squad member individually
console.log({squadUnit});

const listedHealth = squadUnit.Health;
const listedDp20 = squadUnit.Archive.Damage;
console.log({listedDp20, listedHealth});

const squadMode = modes.get(cardSquad.ModeIds[0]); // would need to check for each mode individually
console.log({squadMode});

const modeSpell = spells.get(squadMode.ModeUnitSpells[0]); // would need to find the "main" spell
console.log({modeSpell});

const spellName = spellDescriptions.get(modeSpell.Id).Name;
console.log({spellName});

// TODO what is the purpose of Spell -> SpellLine? translation template retrieved via 9114 + Spell ID
const spellLines = spellTranslations.get(modeSpell.Id);
console.log({spellLines});
const atkCooldown = +spellLines.map(line => new RegExp(/every (\d+) seconds/i).exec(line.Text)).find(v => !!v)[1]; // TODO error handling
console.log({atkCooldown});

// TODO where is localization data including displayed hp/dmg values stored? referenced via SpellLine?

const spellProjectile = projectiles.get(modeSpell.ParametersContainer.Parameters[0].Value);
console.log({spellProjectile});

const projectileSpell = spells.get(spellProjectile.TargetSpellId);
console.log({projectileSpell});

const abilityToGain = abilities.get(projectileSpell.ParametersContainer.Parameters.find(p => p.Id === 386).Value);
const minDmg = abilityToGain.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DamageOnSingleUnit).Value;
const maxDmg = abilityToGain.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.TotalCombinedDamage).Value;

// TODO validate min dmg on unit = min dmg on structure unless there is a reason for it not to be

const realDp20 = (minDmg + maxDmg) / 2 * 20 / atkCooldown;
const realDp20Rounded = 5 * Math.round(realDp20 / 5);
console.log({listedDp20, listedHealth, atkCooldown, minDmg, maxDmg, realDp20Rounded});

if (listedDp20 !== realDp20Rounded) console.warn(`Dp20 mismatch, got ${listedDp20} but expected ${realDp20Rounded}`);
