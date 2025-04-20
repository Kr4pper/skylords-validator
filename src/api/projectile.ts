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
        "Parameters": number[],
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