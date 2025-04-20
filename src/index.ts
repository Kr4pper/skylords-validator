import {existsSync, readdirSync, readFileSync} from 'fs';
import {join} from 'path';
import {Card, CardIds, GameDataTableType} from './api';

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

const loadDataTableType = <T extends {Id: number;}>(db: string, type: GameDataTableType): Map<number, T> => {
    const dataTable = new Map<number, T>();

    for (const filePath of getFilePathsByType(db, type)) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            dataTable.set(entity.Id, entity);
        }
    }

    return dataTable;
};

const cards = loadDataTableType<Card>(dbPath, GameDataTableType.Card);
console.log(cards.get(CardIds.GiantWyrm))

