import { describe, expect, it } from "vitest";
import { ROOM_GAMES, diceMessage, rollDice } from "@/lib/room-games";

describe("room games", () => {
  it("dice always lands on a face from 1 to 6", () => {
    expect(rollDice(() => 0)).toBe(1);
    expect(rollDice(() => 0.999999)).toBe(6);
    expect(rollDice(() => 0.5)).toBe(4);
  });

  it("the dice result line names the face", () => {
    expect(diceMessage(5)).toContain("5");
  });

  it("only the dice game is playable for now", () => {
    expect(ROOM_GAMES.filter((g) => g.ready).map((g) => g.key)).toEqual(["dice"]);
  });
});
