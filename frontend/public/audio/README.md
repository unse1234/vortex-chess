# Vortix Chess audio assets

Relocated without transcoding from the user-supplied root folder `chess.com-custom-sounds-main` on 28 October 2026. All 12 files are MPEG Layer III (MP3), 48 kHz stereo. `asset-inventory.json` records original filenames, destinations, durations, byte sizes and SHA-256 hashes. Every file decoded successfully; destination hashes matched the originals before the source files and empty directory were removed.

The supplied folder contained no license, attribution, README or other metadata. Its name alone does not establish authorship or permission. No license or attribution has been invented. Keep any subsequently supplied license alongside these assets.

Active effects: `game/game-start.mp3`, `move-self.mp3`, `move-opponent.mp3`, `capture.mp3`, `check.mp3`, `castle.mp3`, `promotion.mp3`, `game-end.mp3`, and `notifications/notification.mp3`.

Retained but not mapped at runtime: `game/illegal-move.mp3`, `game/premove.mp3`, `game/ten-seconds.mp3`. No premove feature or audio clock threshold was added. Rejected commands retain their visible error feedback and produce no success cue.

These are short effects, not prerecorded speech. No separate win/loss/draw or voice recordings were supplied. See `docs/Game_Audio.md` at the repository root for cue precedence and integration details.
