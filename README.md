# skylords-validator

Parsing tool that attempts to detect incorrect configuration inside the SR game file JSONs.

## Approach

1. For each player card defined in ./src/api/card-ids.ts
2. For each upgrade of the card
3. Identify card type
4. Gather basic information about card (health, dp20, modes)
5. If there is not exactly 1 mode abort (TODO: parse all modes instead)
6. For each ModeSpell/ModeUnitSpell traverse tree to find dmg values
7. Parse upgrade data attached to card
8. Validate upgrade data against previous upgrade of card

## TODO

1. Handle all modes of cards
2. Extract all abilities/spells from cards? Recursive bubble-up?
3. Handle Phase Tower and Mindweaver
4. 