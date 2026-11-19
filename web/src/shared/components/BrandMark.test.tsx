import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("renders only the rounded /logo.png emblem by default", () => {
    const { container } = render(<BrandMark />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/logo.png");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/Jobs/)).not.toBeInTheDocument();
  });

  it("renders the horizontal '| Jobs.' wordmark with capital J when showWordmark is enabled", () => {
    const { container } = render(<BrandMark showWordmark />);
    const strong = container.querySelector("strong");
    expect(strong).toHaveTextContent("Jobs.");
    expect(strong?.textContent).toBe("Jobs.");
  });

  it("uses custom wordmark text when provided", () => {
    render(<BrandMark showWordmark wordmark="HAU Jobs" />);
    expect(screen.getByText("HAU Jobs")).toBeInTheDocument();
    expect(screen.queryByText("Jobs.")).not.toBeInTheDocument();
  });
});
