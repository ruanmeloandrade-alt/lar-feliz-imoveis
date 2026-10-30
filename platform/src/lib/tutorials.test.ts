import { describe, expect, it } from "vitest";
import {
  canEditTutorials,
  TUTORIAL_EDITOR_ID,
  tutorialPosition,
  youtubeVideoId,
} from "./tutorials";

describe("permissão de tutoriais", () => {
  it("autoriza somente o ID confirmado, nunca um nome ou email", () => {
    expect(canEditTutorials(TUTORIAL_EDITOR_ID)).toBe(true);
    for (const value of [
      null,
      undefined,
      "",
      "Ruan Andrade Negócios",
      "ruanandradenegocios@hotmail.com",
      "d1811cad-06a4-490a-8c5a-2714192a8887",
    ]) {
      expect(canEditTutorials(value)).toBe(false);
    }
  });
});

describe("links YouTube", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])("extrai o ID: %s", (url) => expect(youtubeVideoId(url)).toBe("dQw4w9WgXcQ"));
  it.each([
    "javascript:alert(1)",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil.test/?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=invalid",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/playlist?list=abc",
    "",
  ])("rejeita origem ou ID inválido: %s", (url) => expect(youtubeVideoId(url)).toBeNull());
});

it("valida a ordem das etapas", () => {
  expect(tutorialPosition("0")).toBe(0);
  expect(tutorialPosition("12")).toBe(12);
  for (const value of ["", " ", "-1", "1.5", "abc", "1000001"])
    expect(() => tutorialPosition(value)).toThrow();
});
