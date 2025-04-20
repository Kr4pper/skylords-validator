export interface Card {
    Version: number;
    Id: number;
    DBEntityId: number;
    Type: number;
    ActivationCount: number;
    IsPromo: boolean;
    InternalUseOnly: boolean;
    Rarity: 0 | 1 | 2 | 3;
    Edition: number;
    UIdamageValue: number;
    StateBalancing: number,
    StateEffect: number,
    StateGraphics: number,
    StateOverall: number,
    StateSound: number,
    StateQABalancing: number,
    StateQAEffect: number,
    StateQAGraphics: number,
    StateQAOverall: number,
    StateQASound: number,
    AffinityPowerName: number,
    TokenContainer: {
        Version: number,
        Tokens: [];
    },
    CardConditionReferenceContainer: {
        Version: number,
        References: [];
    },
    CardSpellReferenceContainer: {
        Version: number,
        References: [];
    },
    StoryBookPageUnlock: [];
}