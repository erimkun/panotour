# Modeler Workflow Guide

This guide explains what the modeler should do on production without needing developer support.

## Access Needed

The modeler only needs:

- site URL
- admin URL: `/admin`
- admin password
- edit password for save operations if the edit screen is used

## A. Add a New Project With ZIP

This is the easiest flow.

### Prepare the ZIP

ZIP filename becomes the project code.

Example:

```text
villa-23.zip
```

Recommended ZIP structure:

```text
config.json
images/
  pano1.jpg
  pano2.jpg
audio/
  ambient.mp3
```

### Upload Steps

1. Open `/admin`
2. Login with the admin password
3. Upload the ZIP file
4. Wait for the success message
5. Open `/<projectCode>` to verify the live tour

Example:

```text
/villa-23
```

## B. Edit an Existing Project

Use the editor page:

```text
/<projectCode>/edit
```

### Typical Edit Flow

1. Open the edit page
2. Add or adjust scenes
3. Add or change hotspots
4. Update titles, images, minimap or VR settings
5. Click save
6. Enter `EDIT_SECRET`
7. Refresh the live project page and verify the result

Status rule:

- `Draft` projects stay hidden from the public project page
- `Published` projects appear publicly
- If a project is still being prepared, keep it in `Draft`

## C. Add More Images or Audio Later

If new files are needed after the project already exists:

1. Open `/<projectCode>/edit`
2. Add the new files through the editor
3. Save with `EDIT_SECRET`
4. Confirm the new files appear in the project

## D. Create a Project Without ZIP

If there is no full ZIP yet:

1. Open `/admin`
2. Enter the new project code in the zipless project section
3. Open the editor wizard
4. Enter the project name
5. Optionally select panorama files
6. Choose one of these actions:
7. `Editorde Ac` to continue editing first
8. `ZIP Indir` to export a deliverable ZIP
9. `Sunucuya Yaz` to create the project directly on production storage
10. If you continue in the editor, finish scene setup and save with `EDIT_SECRET`

This is slower than ZIP upload, but it is supported.

## E. What Happens After Save

On production with local storage:

- files are written into the server project storage folder
- the project becomes live immediately
- no rebuild is needed
- no developer action is needed

On Blob fallback:

- if local path is not configured, the same save action writes to Blob
- the project still becomes live without rebuild

## F. Validation Checklist Before Finishing

Before the modeler says a project is done, check these items:

1. The project page opens
2. All panoramas load
3. Hotspots navigate correctly
4. Audio works if used
5. Floorplan works if used
6. Mobile check is done
7. VR visibility is correct if VR is enabled

## G. If Something Fails

If ZIP upload fails:

- check that ZIP name is a valid project code
- check that `config.json` exists
- check that image names in `config.json` match uploaded files exactly

If save fails on the edit page:

- check the edit password
- check internet connection
- retry once
- if still broken, report the exact project code and action attempted

If a panorama is black or missing:

- verify the image filename
- verify the file was actually uploaded
- verify the scene points to the correct image

## H. Recommended Naming Rules

Use these naming rules consistently:

- project codes: lowercase, hyphenated
- image names: lowercase, no spaces
- audio names: lowercase, no spaces
- avoid Turkish characters in filenames

Examples:

- `villa-23`
- `salon-01.jpg`
- `yatak-odasi-02.jpg`
- `ambient-loop.mp3`