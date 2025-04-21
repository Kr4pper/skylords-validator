import {CardIds} from './card-ids';

export enum DiagnosticType {
    Dp20Mismatch = 'Dp20Mismatch',
    HardCodedAttackRate = 'HardCodedAttackRate',
}

const bla: DiagnosticContainer = {card: {id: CardIds.GiantWyrmU0, name: 'giant wyrm'}, diag: {type: DiagnosticType.Dp20Mismatch, listedDp20: 1, expectedDp20: 2}};

export type DiagnosticContainer = DiagnosticBase & {
    diag: (
        | {type: DiagnosticType.Dp20Mismatch;} & Dp20Mismatch
        | {type: DiagnosticType.HardCodedAttackRate;} & HardCodedAttackRate
    );
};

type DiagnosticBase = {card: {id: CardIds; name: string;};};

type Dp20Mismatch = {listedDp20: number, expectedDp20: number;};

type HardCodedAttackRate = {translationText: string;};
