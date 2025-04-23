import {CardIds} from './card-ids';
import {ArmorType, SizeType} from './unit';

export enum DiagnosticType {
    Dp20Mismatch = 'Dp20Mismatch',
    HardCodedAttackRate = 'HardCodedAttackRate',
    UnsupportedEntity = 'UnsupportedEntity',
    MultipleSquadModesFound = 'MultipleSquadModesFound',
    MultipleModeSpellsFound = 'MultipleModeSpellsFound',
    UpgradeMismatch = 'UpgradeMismatch',
    UsesRangedArmor = 'UsesRangedArmor',
    SizeArmorMismatch = 'SizeArmorMismatch',
}

export type Diagnostic = (
    | {type: DiagnosticType.Dp20Mismatch;} & Dp20Mismatch
    | {type: DiagnosticType.HardCodedAttackRate;} & HardCodedAttackRate
    | {type: DiagnosticType.UnsupportedEntity;} & UnsupportedEntity
    | {type: DiagnosticType.MultipleSquadModesFound;} & MultipleSquadModesFound
    | {type: DiagnosticType.MultipleModeSpellsFound;} & MultipleModeSpellsFound
    | {type: DiagnosticType.UpgradeMismatch;} & UpgradeMismatch
    | {type: DiagnosticType.UsesRangedArmor;} & UsesRangedArmor
    | {type: DiagnosticType.SizeArmorMismatch;} & SizeArmorMismatch
);

export type DiagnosticContainer = {card: {id: CardIds; name: string;}, diag: Diagnostic;};

type Dp20Mismatch = {listedDp20: number, expectedDp20: number; attackRate: number;};

type HardCodedAttackRate = {scrapedAttackRate: number; attackRate: number;};

type MultipleSquadModesFound = {modeIds: number[];};

type MultipleModeSpellsFound = {spellIds: number[];};

type UnsupportedEntity = {entity: string;};

type UpgradeMismatch = {property: string; oldValue: number, newValue: number, upgradeValue: number;};

type UsesRangedArmor = {armor: ArmorType;};

type SizeArmorMismatch = {size: SizeType, armor: ArmorType;};
