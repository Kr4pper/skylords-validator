export interface Unit {
    "Version": number,
    "Id": number,
    "Health": number,
    "ArmorType": ArmorType,
    "Scaling": number,
    "Flags": number,
    "Height": number,
    "Size": SizeType,
    "RotationSpeed": number,
    "Archive": {
        "Version": number,
        "WeaponType": WeaponType,
        "Damage": number,
        "MinimalRange": number,
        "MaximalRange": number,
    },
    "VisRange": number,
    "MeshContainer": {
        "Version": number,
        "Meshes": {
            "Id": number,
            "Type": number,
            "FilePath": string,
        }[];
    };
}

export enum SizeType {
    Small = 1,
    Medium = 2,
    Large = 3,
    ExtraLarge = 4,
}

export enum ArmorType {
    MeleeSmall = 1,
    MeleeMedium = 2,
    MeleeLarge = 3,
    MeleeExtraLarge = 4,
    RangedSmall = 5,
    RangedMedium = 6,
    RangedLarge = 7,
    RangedExtraLarge = 8,
}

export enum WeaponType {
    MeleeSmall = 1,
    MeleeMedium = 2,
    MeleeLarge = 3,
    MeleeExtraLarge = 4,
    RangedSmall = 5,
    RangedMedium = 6,
    RangedLarge = 7,
    RangedExtraLarge = 8,
}
