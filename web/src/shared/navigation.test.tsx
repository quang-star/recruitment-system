import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useUrlView } from "./navigation";
import { useUnsavedChanges } from "./useUnsavedChanges";

function Navigation({ dirty = false, blocked = () => {} }: { dirty?: boolean; blocked?: () => void }) {
  const [view, navigate] = useUrlView("view", ["home", "search"] as const, "home");
  useUnsavedChanges(dirty, blocked);
  return <><p>{view}</p><button onClick={() => navigate("search")}>Search</button></>;
}

it("hydrates navigation from the URL and responds to browser history", () => {
  window.history.replaceState(null, "", "/?view=search");
  render(<Navigation />);
  expect(screen.getByText("search")).toBeInTheDocument();
  act(() => { window.history.replaceState(null, "", "/?view=home"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(screen.getByText("home")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Search"));
  expect(window.location.search).toContain("view=search");
});

it("keeps an unsaved editor alive during button and history navigation", () => {
  const blocked = vi.fn();
  render(<Navigation dirty blocked={blocked} />);
  fireEvent.click(screen.getByText("Search"));
  expect(screen.getByText("home")).toBeInTheDocument();
  act(() => { window.history.replaceState(null, "", "/?view=search"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(window.location.search).toBe("");
  expect(blocked).toHaveBeenCalledTimes(2);
});
