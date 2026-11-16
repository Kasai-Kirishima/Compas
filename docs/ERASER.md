# Partial Eraser

`eraseAlongPath(objects, path, radius, options)` clips the geometry covered by a swept round brush and returns a transaction. It does not mutate the input scene.

- Lines and centrelines are split into surviving line fragments.
- Circles become one or more surviving arcs.
- Arcs are split into surviving arcs.
- Polygons are converted to surviving line fragments only for the edges actually crossed by the brush; untouched edges remain visible as line entities.
- Dimension linework is split locally; crossing the number label removes only that label.
- Locked or hidden objects are skipped.
- Fully covered objects are protected by default. Use an explicit Delete command to delete an entire object.

## Preventing accidental whole-scene erasure

For UI tools, prefer `eraseTargetAlongPath(objects, targetId, path, radius, options)`. It scopes the stroke to one target ID and always forces `allowCompleteErase: false`. This prevents one mouse drag from erasing adjacent unrelated geometry.

The demo starts in Select mode. When Eraser mode is active, a stroke starts on the selected object or on the first object under the brush. The optional **Стирати всі об’єкти під штрихом** setting deliberately opts into modifying every intersected primitive. Complete object deletion remains unavailable through the brush.

## Coordinate system

Path points and brush radius are in the same world units as geometry (normally mm). Convert CSS-pixel radius to world units using `eraserRadiusInWorld(pixelRadius, worldToScreenScale)`, where `worldToScreenScale` is CSS pixels per world unit.


## Demo UI targeting (1.5.1)

In the standard mode the target is the topmost editable primitive under the pointer at the beginning of the stroke. A previously selected object does not override the object actually clicked. The `eraseAllTargets` option is captured on pointer-down, so toggling it while a stroke is in progress does not widen or narrow that stroke's scope.


The demo captures the all-objects checkbox at pointer-down. Toggling the checkbox during a stroke does not change the current stroke scope.
