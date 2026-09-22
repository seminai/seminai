import { describe, expect, it } from "vitest";
import {
  DELETE_CONFIRMATION_TEXT,
  isDeleteConfirmationValid,
} from "./delete-confirmation";

describe("isDeleteConfirmationValid", () => {
  it("requires the exact delete confirmation text after trimming", () => {
    expect(
      isDeleteConfirmationValid(" ELIMINA ", DELETE_CONFIRMATION_TEXT),
    ).toBe(true);
    expect(isDeleteConfirmationValid("elimina", DELETE_CONFIRMATION_TEXT)).toBe(
      false,
    );
    expect(
      isDeleteConfirmationValid("ELIMINA tutti", DELETE_CONFIRMATION_TEXT),
    ).toBe(false);
  });
});
