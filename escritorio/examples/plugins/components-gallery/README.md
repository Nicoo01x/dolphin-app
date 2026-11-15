# Components Gallery

One build-less TSX panel that uses every component in the components catalog: form controls
(`Textarea`, `Checkbox`, `RadioGroup`, `Slider`, `Field`), layout (`Tabs`, `Collapsible`, `Toolbar`,
`Grid`, `Box`, tooltips), a paged and sortable `Table`, a lazily loaded `Tree`, `Markdown`, `CodeView`, a
plugin `Image`, `KeyValue`, `Callout` and `Skeleton`. It needs Dolphin 1.4.248 or newer
(`Box` is catalog 4).

```sh
dolphin plugin dev load .   # also writes .dolphin/types, the typings tsconfig.json extends
dolphin plugin test .       # runs src/panel.test.tsx in Node with dolphin/testing
dolphin plugin check .      # renders the panel once and reports errors with file:line
```

`src/files.ts` stands in for a data source: the Table asks for the next page with `onLoadMore`
when the person scrolls near the end, and the Tree reads a folder's children on first expand.
