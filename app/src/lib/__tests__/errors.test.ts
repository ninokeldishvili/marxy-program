import { describe, expect, it } from "vitest";

import idl from "../../idl/marxy.json";
import { ERROR_MESSAGES, ERROR_NAMES, extractErrorCode, friendlyError } from "../errors";

describe("error mapping", () => {
  it("has a friendly message for every custom error in the IDL", () => {
    for (const e of idl.errors) {
      expect(ERROR_MESSAGES[e.name], e.name).toBeTruthy();
      expect(ERROR_NAMES[e.code]).toBe(e.name);
    }
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual(idl.errors.map((e) => e.name).sort());
  });

  const code = (name: string) => idl.errors.find((e) => e.name === name)!.code;

  it("reads the code from Anchor errors", () => {
    const err = { error: { errorCode: { code: "AlreadyLastBidder", number: code("AlreadyLastBidder") } } };
    expect(friendlyError(err).message).toBe("You're already the last bidder.");
  });

  it("reads the code from simulation logs and hex custom errors", () => {
    const logs = {
      message: "Simulation failed",
      logs: [`Program log: AnchorError occurred. Error Code: NoCreditsLeft. Error Number: ${code("NoCreditsLeft")}.`],
    };
    expect(friendlyError(logs)).toMatchObject({ name: "NoCreditsLeft", message: "You have no credits left." });
    const hex = new Error(`failed: custom program error: 0x${code("SalesLocked").toString(16)}`);
    expect(friendlyError(hex).name).toBe("SalesLocked");
    expect(extractErrorCode({ message: '{"InstructionError":[0,{"Custom":6031}]}' })).toBe(6031);
  });

  it("recognises wallet rejections, low funds and wrong networks", () => {
    expect(friendlyError(new Error("User rejected the request.")).message).toMatch(/cancelled/);
    expect(friendlyError(new Error("Attempt to debit an account but found no record of a prior credit."))).toMatchObject({
      networkHint: true,
    });
    expect(friendlyError(new Error("Blockhash not found")).networkHint).toBe(true);
    expect(friendlyError(new Error("custom program error: 0x1")).message).toMatch(/Not enough/);
  });
});
