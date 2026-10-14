import type { ComponentType } from 'react';
import type * as THREE from 'three';

/**
 * TOPIC MEDIA — the contract (Deepak, round 4: "an animated youtube video per
 * topic … a modal … a section below the video where students can actually
 * play with the concepts … in 3js").
 *
 * One folder per topic that has media, `src/topics/library/<slug>/`:
 *
 *   topic.json       which syllabus topic this is + its YouTube video id
 *                    (`TopicManifest`; `npm run topic -- new` writes it,
 *                    `npm run topic -- link` fills `youtube`)
 *   video.ts         the animation the video is rendered from (`VideoScript`,
 *                    default export; drawn in `studio.html`, rendered to MP4
 *                    by `npm run video:render`)
 *   Playground.tsx   the interactive three.js section under the video
 *                    (`PlaygroundProps`, default export)
 *   model.ts         (optional) the maths both of them draw from
 *
 * The registry (`registry.ts`) discovers folders by glob: adding a folder
 * is all the wiring there is. `topic.json` is the only file a script edits.
 */

/** `topic.json`. `doc`/`chapter`/`topic` locate it in the syllabus (1-based,
 *  as the chapter page numbers them); `key` is the progress key
 *  (`curriculum/progress.ts › topicKey`), checked against the syllabus by a
 *  unit test so a re-extracted syllabus can't silently orphan a video. */
type TopicManifest = {
  key: string;
  doc: string;
  chapter: number;
  topic: number;
  /** Short human title for the video (YouTube title, studio list). */
  title: string;
  /** The YouTube video id once published, else null. */
  youtube: string | null;
};

type TopicEntry = TopicManifest & { slug: string };

/** What a playground gets. It owns its canvas and controls; it must stop
 *  animating when `active` is false (the modal is closing or off screen). */
type PlaygroundProps = {
  reducedMotion: boolean;
  active: boolean;
};

type PlaygroundModule = { default: ComponentType<PlaygroundProps> };

/** One beat of the video: when it starts, what is on screen, and a
 *  suggested line for the voice-over (the cue sheet is built from these). */
type VideoBeat = { at: number; label: string; say?: string };

/** What the studio hands a video script. Everything is sized for the output
 *  frame (1920×1080 by default); the renderer is the studio's. */
type VideoContext = {
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  /** Frames per second of the render (for scripts that step physics). */
  fps: number;
};

/** A video's animation. DETERMINISTIC: `frame(t)` draws the frame at `t`
 *  seconds from scratch-state (no wall clock, no unseeded randomness, no
 *  state carried between calls that a seek would break), so the studio can
 *  scrub and the renderer can capture frame by frame. */
type VideoScript = {
  title: string;
  /** Seconds. */
  duration: number;
  beats: VideoBeat[];
  /** Seconds: the frame `npm run video:render` saves as the thumbnail
   *  candidate (`<slug>.poster.png`). Default: the middle of the middle beat. */
  poster?: number;
  create(context: VideoContext): { frame(t: number): void; resize?(width: number, height: number): void; dispose(): void };
};

type VideoModule = { default: VideoScript };

export type { PlaygroundModule, PlaygroundProps, TopicEntry, TopicManifest, VideoBeat, VideoContext, VideoModule, VideoScript };
