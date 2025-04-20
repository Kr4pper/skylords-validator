import {readFileSync, writeFileSync} from 'fs';

const cardIdsFile = readFileSync('src/data/card-ids.txt').toString().split('\r\n');
console.log('Input file read, number of lines is', cardIdsFile.length);

const cards = new Map<string, number>();

let idx = 0;
while (idx < cardIdsFile.length - 1) {
    const id = cardIdsFile[idx++].match(/(\d+)/)[0];
    const name = cardIdsFile[idx++].match(/(\w+)/)[0];
    cards.set(name, +id);
}

const result = `export enum CardIds {
    ${[...cards.entries()]
        .map(([name, id]) => `${name}U0 = ${id},\n ${name}U1 = ${id + 1_000_000},\n ${name}U2 = ${id + 2_000_000},\n ${name}U3 = ${id + 3_000_000},\n `)
        .join('\n ')
    }
}`;

writeFileSync('src/api/card-ids.ts', result);
console.log('Output file written with', cards.size, 'entries');
