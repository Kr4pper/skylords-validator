import {CardIds} from './card-ids';

export enum DiagnosticType {
    Dp20Mismatch = 'Dp20Mismatch',
    HardCodedAttackRate = 'HardCodedAttackRate',
    UnsupportedEntity = 'UnsupportedEntity',
    MultipleSquadModesFound = 'MultipleSquadModesFound',
    MultipleModeSpellsFound = 'MultipleModeSpellsFound',
}

export type Diagnostic = (
    | {type: DiagnosticType.Dp20Mismatch;} & Dp20Mismatch
    | {type: DiagnosticType.HardCodedAttackRate;} & HardCodedAttackRate
    | {type: DiagnosticType.UnsupportedEntity;} & UnsupportedEntity
    | {type: DiagnosticType.MultipleSquadModesFound;} & MultipleSquadModesFound
    | {type: DiagnosticType.MultipleModeSpellsFound;} & MultipleModeSpellsFound
);

export type DiagnosticContainer = {card: {id: CardIds; name: string;}, diag: Diagnostic;};

type Dp20Mismatch = {listedDp20: number, expectedDp20: number; attackRate: number;};

type HardCodedAttackRate = {translationText: string;};

type MultipleSquadModesFound = {modeIds: number[];};

type MultipleModeSpellsFound = {spellIds: number[];};

type UnsupportedEntity = {entity: string;};
