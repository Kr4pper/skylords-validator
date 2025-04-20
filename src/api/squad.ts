export interface Squad {
    "Version": number,
    "Id": number,
    "CardId": number,
    "Flags": number,
    "DBFolderId": number,
    "FormationDisturbance": number,
    "SpawnGotoDistance": number,
    "ProductionPower": number,
    "ProductionMorphPower": number,
    "ProductionTime": number,
    "ThreatValue": number,
    "VisLookAtInterest": number,
    "Status": number,
    "SoundAcknowledgmentFile": "",
    "IconImage": {
        "Icon": ".\\bf1\\gfx\\ui\\cardartwork\\units\\skel_human_female_mage\\unit_bandit_sorceress_squatter\\unit_bandit_sorceress_squatter_artwork_icon.dds",
        "Artwork": ".\\bf1\\gfx\\ui\\cardartwork\\units\\skel_human_female_mage\\unit_bandit_sorceress_squatter\\unit_bandit_sorceress_squatter_artwork.dds",
    },
    "Unknown2": 0,
    "Formation": [],
    "SquadMembers": [
        {
            "UnitId": number,
            "Count": number,
        }
    ],
    "ModeIds": number[],
    "PveTypeIds": [],
    "EffectsContainer": {
        "Version": number,
        "Effects": []
    },
    "Classes": number[]
}