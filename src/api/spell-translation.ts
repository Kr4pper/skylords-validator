export interface SpellTranslation {
    "Id": number,
    "LocaType": number,
    "Text": string,
}

export enum SpellLocaType {
    Name = 2,
    Description = 3,
    MinDmg = 6,
    MaxDmg = 7,
    AtkCooldown = 8, // ?
    Radius = 14,
}