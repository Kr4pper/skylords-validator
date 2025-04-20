import {readdirSync, readFileSync} from 'fs';
import {join} from 'path';
import {CardIds, GameDataTableType, LanguageTableType} from '../api';

const getFilePathsByType = (path: string, type: number | string) => {
    const res: string[] = [];

    for (const file of readdirSync(path)) {
        if (file.startsWith(type.toString())) {
            res.push(join(path, file));
        }
    }

    return res;
};

export const loadGameData = <T extends {Id: number;}>(db: string, type: GameDataTableType): Map<number, T> => {
    const dataTable = new Map<CardIds, T>();

    for (const filePath of getFilePathsByType(db, type)) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            dataTable.set(entity.Id, entity);
        }
    }

    return dataTable;
};

export const loadLanguageTable = <T extends {Id: number;}>(db: string, type: LanguageTableType): Map<number, T[]> => {
    const languageTable = new Map<number, T[]>();

    for (const filePath of getFilePathsByType(db, type + '_en')) {
        const file = JSON.parse(readFileSync(filePath).toString()) as {Entities: T[];};
        for (const entity of file.Entities) {
            const next = languageTable.get(entity.Id) ? [...languageTable.get(entity.Id), entity] : [entity];
            languageTable.set(entity.Id, next);
        }
    }

    return languageTable;
};
