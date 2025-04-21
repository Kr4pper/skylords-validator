export interface Projectile {
    "Version": number,
    "Id": number,
    "TrajectoryType": number,
    "Speed": number,
    "ProjectileLine": number,
    "TargetHeight": number,
    "Flags": number,
    "TargetSpellId": number,
    "VisLookAtInterest": number,
    "ParametersContainer": {
        "Version": number,
        "Parameters": {
            "Id": number,
            "Value": number,
            "Type": number,
        }[];
    },
    "MeshContainer": {
        "Version": number,
        "Meshes": [
            {
                "Id": number,
                "Type": number,
                "FilePath": string,
            }
        ];
    };
}

export enum ProjectileParameterId {
    ChainHomingSpell1 = 2,
    ChainHomingSpell2 = 3,
    ChainHomingSpell3 = 4,
    ChainHomingSpell4 = 5,
    ChainHomingSpell5 = 6,
}

export const PROJECTILE_CHAIN_IDS = [
    ProjectileParameterId.ChainHomingSpell1,
    ProjectileParameterId.ChainHomingSpell2,
    ProjectileParameterId.ChainHomingSpell3,
    ProjectileParameterId.ChainHomingSpell4,
    ProjectileParameterId.ChainHomingSpell5,
];
