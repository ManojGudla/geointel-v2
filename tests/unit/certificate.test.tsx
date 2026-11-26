import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Certificate } from "@/features/play/components/Certificate";
import {
  CERT_FINE_PRINT,
  certificateFileName,
  certificateText,
  cleanName,
  formatIssueDate,
  isValidName,
} from "@/features/play/components/certificateImage";

/*
  The owner asked on 26 November 2026 for a certificate that says
  "Congratulations", carries a name the player enters, and looks like a
  professional certificate, without claiming anything it cannot back.
*/

const props = { gameTitle: "Cricket: Super Chase", headline: "Chased it down: 34/1", score: 34, scoreLabel: "Runs", detail: "Target was 33." };

describe("the name on a certificate", () => {
  it("keeps letters of any script, so Indian names work, and drops anything else", () => {
    expect(cleanName("  Manoj   Kumar  ")).toBe("Manoj Kumar");
    expect(cleanName("మనోజ్ కుమార్")).toBe("మనోజ్ కుమార్");
    expect(cleanName("मनोज")).toBe("मनोज");
    expect(cleanName("O'Brien-Smith Jr.")).toBe("O'Brien-Smith Jr.");
    expect(cleanName("<script>alert(1)</script>")).toBe("scriptalertscript");
    expect(cleanName("Manoj 😀 123")).toBe("Manoj");
  });

  it("caps the length so a long name cannot break the layout", () => {
    expect(cleanName("A".repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it("needs at least two letters", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName(" M ")).toBe(false);
    expect(isValidName("M.")).toBe(false);
    expect(isValidName("Mo")).toBe(true);
  });
});

describe("what the certificate says", () => {
  const text = certificateText({ ...props, name: "Manoj Kumar", issuedOn: new Date("2026-11-26T12:00:00Z") });

  it("congratulates the named player for the result they actually got", () => {
    expect(text.title).toBe("Certificate of Achievement");
    expect(text.congratulations).toBe("Congratulations");
    expect(text.name).toBe("Manoj Kumar");
    expect(text.game).toBe("Cricket: Super Chase");
    expect(text.result).toBe("Chased it down: 34/1 · Runs: 34");
    expect(text.date).toBe("26 November 2026");
  });

  it("names its issuer plainly and says what it is, with no credential number or verification claim", () => {
    expect(text.issuer).toBe("maNOWj PLAY");
    expect(text.fine).toBe(CERT_FINE_PRINT);
    expect(text.fine).toContain("Not an academic or professional qualification");
    const all = JSON.stringify(text).toLowerCase();
    for (const claim of ["credential", "verified", "verification", "accredited", "licence", "license", "id:"]) {
      expect(all).not.toContain(claim);
    }
  });

  it("writes the date the same way in every country", () => {
    expect(formatIssueDate(new Date("2026-01-05T12:00:00Z"))).toBe("5 January 2026");
  });

  it("names the download after the game and the player", () => {
    expect(certificateFileName({ name: "Manoj Kumar", gameTitle: "Cricket: Super Chase" })).toBe("maNOWj-PLAY-certificate-cricket-super-chase-manoj-kumar.png");
    // A name in another script still gives a usable file name.
    expect(certificateFileName({ name: "మనోజ్", gameTitle: "Cricket" })).toMatch(/^maNOWj-PLAY-certificate-cricket-[\w-]+\.png$/);
  });
});

describe("the certificate on screen (rendered in jsdom)", () => {
  beforeEach(() => localStorage.clear());

  it("asks for the name first, and will not make a certificate without one", () => {
    render(<Certificate {...props} />);
    expect(screen.getByText(/Congratulations! You have earned a certificate/)).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create my certificate" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Certificate of Achievement")).toBeNull();
  });

  it("shows the certificate with Congratulations and the entered name", () => {
    render(<Certificate {...props} />);
    fireEvent.change(screen.getByLabelText(/Enter your name/), { target: { value: "Manoj Kumar" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my certificate" }));
    expect(screen.getByText("Certificate of Achievement")).toBeTruthy();
    expect(screen.getByText("Congratulations")).toBeTruthy();
    expect(screen.getByText("Manoj Kumar")).toBeTruthy();
    expect(screen.getByText("Cricket: Super Chase")).toBeTruthy();
    expect(screen.getByText("Chased it down: 34/1 · Runs: 34")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download certificate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print or save as PDF" })).toBeTruthy();
  });

  it("remembers the name in this browser and offers it next time, still asking to confirm", () => {
    const first = render(<Certificate {...props} />);
    fireEvent.change(screen.getByLabelText(/Enter your name/), { target: { value: "Manoj Kumar" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my certificate" }));
    first.unmount();
    render(<Certificate {...props} />);
    expect((screen.getByLabelText(/Enter your name/) as HTMLInputElement).value).toBe("Manoj Kumar");
    expect(screen.queryByText("Certificate of Achievement")).toBeNull();
  });

  it("lets the player change the name", () => {
    render(<Certificate {...props} />);
    fireEvent.change(screen.getByLabelText(/Enter your name/), { target: { value: "Manoj" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my certificate" }));
    fireEvent.click(screen.getByRole("button", { name: "Change name" }));
    fireEvent.change(screen.getByLabelText(/Enter your name/), { target: { value: "Manoj Kumar Gudla" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my certificate" }));
    expect(screen.getByText("Manoj Kumar Gudla")).toBeTruthy();
  });
});
