# Spatial Index Visualizer

A browser tool for seeing how two spatial indexes divide up the same set of 2D points:

- **k-d tree**: splits space with axis-aligned lines, alternating between x and y. Each split cuts a region in two at a point, so the regions never overlap and together cover the whole plane.
- **R-tree**: groups nearby points into bounding rectangles, then groups those rectangles into larger ones. The rectangles fit the data tightly but can overlap, and empty space is often left uncovered.

You upload an image (a map, a photo, a scan) to use as the backdrop, place points on it, and compare the two partitions drawn over the same points.

## Status

This is the app shell. It can load a PNG or JPG and draw it on the canvas. Neither tree is built yet.

## Coordinates

Image pixel coordinates are the single source of truth. `(0, 0)` is the image's top-left pixel and `(width, height)` is its bottom-right corner, at native resolution. The image is shown at native size, or shrunk to fit the window if it is too big; it is never enlarged.

The canvas context transform maps image pixels to device pixels, so drawing code uses image coordinates directly and always lines up with the image, whatever the display scale or screen density. Pointer events are converted back to image coordinates with `clientToImage`. All of this lives in [`src/geometry/imageSpace.ts`](src/geometry/imageSpace.ts).

## Run it locally

You need Node.js 20.19 or newer and [pnpm](https://pnpm.io). If `pnpm` is not installed, `npx pnpm <command>` works too.

```sh
pnpm install
pnpm dev          # start the dev server at http://localhost:5173
```

Other scripts:

```sh
pnpm test         # run the Vitest suite once
pnpm test:watch   # run Vitest in watch mode
pnpm lint         # ESLint
pnpm typecheck    # TypeScript (tsc -b)
pnpm build        # type-check and build to dist/
pnpm preview      # serve the production build
```

## TypeScript versions

`tsc` is TypeScript 7, installed under the alias `@typescript/native`. TypeScript 7 has no JavaScript API yet, so the `typescript` package name is aliased to `@typescript/typescript6`, which typescript-eslint needs. This follows [Microsoft's side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0). Once typescript-eslint supports TypeScript 7.1 or later, the alias can go.

## Project layout

```
src/
  App.tsx                    page layout and image loading state
  components/
    ImageCanvas.tsx          sizes the canvas and draws in image coordinates
    Sidebar.tsx              upload button and image details
  geometry/imageSpace.ts     coordinate conversions (fit scale, canvas layout, pointer mapping)
  image/loadImage.ts         PNG/JPG validation and decoding
```
