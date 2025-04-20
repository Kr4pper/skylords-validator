import {existsSync, readdirSync, readFileSync} from 'fs';
import {join} from 'path';
import {Ability, AbilityParameterIds, Card, CardIds, GameDataTableType, Mode, Projectile, Spell, Squad, Unit} from './api';

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

const loadDataTableType = <T extends {Id: number;}>(db: string, type: GameDataTableType): Map<CardIds, T> => {
    const dataTable = new Map<CardIds, T>();

    for (const filePath of getFilePathsByType(db, type)) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            dataTable.set(entity.Id, entity);
        }
    }

    return dataTable;
};

const cards = loadDataTableType<Card>(dbPath, GameDataTableType.Card);
const giantWyrmCard = cards.get(CardIds.GiantWyrmU0);

const squads = loadDataTableType<Squad>(dbPath, GameDataTableType.Squad);
const giantWyrmSquad = squads.get(giantWyrmCard.DBEntityId);
console.log(giantWyrmSquad);

const units = loadDataTableType<Unit>(dbPath, GameDataTableType.Unit);
const giantWyrmUnit = units.get(giantWyrmSquad.SquadMembers[0].UnitId); // would need to check for each individually
console.log(giantWyrmUnit);
const giantWyrmHealth = giantWyrmUnit.Health;
const giantWyrmDmg = giantWyrmUnit.Archive.Damage;
console.log({giantWyrmDmg, giantWyrmHealth});

const modes = loadDataTableType<Mode>(dbPath, GameDataTableType.Mode);
const giantWyrmMode = modes.get(giantWyrmSquad.ModeIds[0]); // would need to check for each individually
console.log(giantWyrmMode);

const spells = loadDataTableType<Spell>(dbPath, GameDataTableType.Spell);
const giantWyrmSpell = spells.get(giantWyrmMode.ModeUnitSpells[0]); // would need to check for each individually
console.log(giantWyrmSpell.ParametersContainer);

// TODO where is localization data including displayed hp/dmg values stored? referenced via SpellLine?

const projectiles = loadDataTableType<Projectile>(dbPath, GameDataTableType.Projectile);
const giantWyrmProjectile = projectiles.get(giantWyrmSpell.ParametersContainer.Parameters[0].Value);
console.log(giantWyrmProjectile);

const giantWyrmProjectileSpell = spells.get(giantWyrmProjectile.TargetSpellId);
console.log(giantWyrmProjectileSpell.ParametersContainer);

const abilities = loadDataTableType<Ability>(dbPath, GameDataTableType.Ability);
const abilityToGain = abilities.get(giantWyrmProjectileSpell.ParametersContainer.Parameters.find(p => p.Id === 386).Value);
console.log(abilityToGain.ParametersContainer.Parameters.find(p => p.Id === AbilityParameterIds.DamageOnSingleUnit).Value);
