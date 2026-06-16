# Fonts

`inter-*.b64.ts` are base64-embedded static instances of **Inter** (SIL Open Font
License 1.1, © The Inter Project Authors — https://github.com/rsms/inter),
instanced from the official Google Fonts variable Inter at `opsz=14` and
`wght=400` / `wght=700` via `fonttools`:

    python -m fontTools.varLib.instancer "Inter[opsz,wght].ttf" wght=400 opsz=14 -o Inter-Regular.ttf
    python -m fontTools.varLib.instancer "Inter[opsz,wght].ttf" wght=700 opsz=14 -o Inter-Bold.ttf

They are embedded (not loaded from disk) so the server-generated Director Brief
PDF renders in the app's font on serverless with no font-file lookup.
