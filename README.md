# Spatial Index Visualizer

A browser tool for seeing how two spatial indexes divide up the same set of 2D points:

- **k-d tree**: splits space with axis-aligned lines, alternating between x and y. Each split cuts a region in two at a point, so the regions never overlap and together cover the whole plane.
- **R-tree**: groups nearby points into bounding rectangles, then groups those rectangles into larger ones. The rectangles fit the data tightly but can overlap, and empty space is often left uncovered.

You upload an image (a map, a photo, a scan) to use as the backdrop, place points on it, and compare the two partitions drawn over the same points.

## Status

The app loads a PNG or JPG, finds the black dots on it, lets you fix the result by hand, and draws a k-d tree over the points. The R-tree is not built yet.

## Point detection

When an image loads, [`src/detection/detectPoints.ts`](src/detection/detectPoints.ts) finds small dark dots and stores their centers as points in image pixel coordinates:

1. Each pixel is composited onto white (so transparent PNG backgrounds read as white) and counted as dark if its luminance is below 128.
2. Dark pixels are grouped into 8-connected blobs.
3. The typical dot area is the median area of blobs that are round and solid.
4. Blobs under 30% of that area are noise. Blobs over 3.5 times it (borders, large text) are ignored.
5. Dot-sized blobs must also be round and solid. The test compares a blob's area to the solid ellipse with the same second moments. A disc scores about 1, while letters, rings and strokes score lower or come out elongated. This matters because small text is often the same size as a dot.
6. Blobs about 2 or 3 dots in size are split with k-means. The split is kept only if every piece passes the same shape test.

The thresholds are in `DEFAULT_DETECTION_OPTIONS`.

Click empty space on the image to add a point, or click a marker to remove it. "Reset to detected points" undoes all hand edits.

Known limits: a dot that touches a line or a letter merges with it and is dropped, and dots that are not dark (colored or light gray) are not detected. Add those by hand.

## k-d tree view

Pick **k-d tree** under View to draw the tree over the image. [`src/trees/kdtree.ts`](src/trees/kdtree.ts) builds it with no UI code:

- Each node splits its points at the median, alternating x and y by depth, starting on the axis you choose. A node with at most "leaf capacity" points becomes a leaf.
- The split value is the midpoint between the two middle sorted values, so no line passes through a point. With duplicate middle values, the split moves to the nearest position where the values differ. If a node's points all share one coordinate it splits on the other axis, and identical points stay in one leaf.
- The root region is the whole image, and each split line is drawn only across its own node's region.

Lines are colored and sized by depth: the top level is the darkest and thickest blue, and deeper levels are lighter and thinner. Deeper lines are drawn first so the top-level splits stay visible. The blue ramp has five steps (checked for even lightness gaps and contrast on white); levels past the fifth reuse the lightest blue and differ only by width. The sidebar shows the tree depth, leaf count, points per leaf, and a legend of each level's axis and split count. Everything redraws when points or settings change.

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
    ImageCanvas.tsx          sizes the canvas, draws the image and point markers
    KdTreePanel.tsx          view switch, k-d settings, summary and legend
    Sidebar.tsx              upload button, point count and image details
  detection/detectPoints.ts  dot detection (threshold, labeling, shape test, k-means split)
  geometry/imageSpace.ts     coordinate conversions (fit scale, canvas layout, pointer mapping)
  image/loadImage.ts         PNG/JPG validation and decoding
  image/readPixels.ts        reads a decoded image's RGBA pixels
  points/editPoints.ts       click to add or remove a point
  render/kdTreeStyle.ts      depth colors and widths, draws split lines
  settings/kdSettings.ts     k-d defaults and leaf capacity validation
  trees/kdtree.ts            k-d tree build, split segments and summary
```
