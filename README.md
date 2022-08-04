# Dice Plugin for NodeBB

A dice plugin integrated with topic events (for display on Persona timeline or other implementation of events)

## Throwing dice

Add `/roll <dice string>` into a post.
This supports most common dice notations - from the basic `xdY` (for example `4d6` for four 6 sided dice), through addition, subtraction, multiplication and division (for example `2d8+4d4*5` will roll 2 d8 dice and add the result to a sum of a roll of 4 d4 dice multiplied by 5), to dropping lowest/highest dice (`xdYdl1`/`xdYdh1`) or counting successes (`5d6>3` will return number of dice that were above 3). See RPG Dice Roller documentation for the full and current information on supported notation: https://dice-roller.github.io/documentation/guide/notation/

## Installation

```bash
npm install nodebb-plugin-ws-dice
```
