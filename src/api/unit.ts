export interface Unit {
    "Version": number,
    "Id": number,
    "Health": number,
    "ArmorType": number,
    "Scaling": number,
    "Flags": number,
    "Height": number,
    "Size": number,
    "RotationSpeed": number,
    "Archive": {
        "Version": number,
        "WeaponType": number,
        "Damage": number,
        "MinimalRange": number,
        "MaximalRange": number,
    },
    "VisRange": number,
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