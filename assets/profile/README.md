# Homepage profile

Add your personal profile PNG as `assets/profile/profile.png`.

The homepage loads it automatically through `home-content.js`, keeps a circular crop, and never replaces it during Miku/Teto theme switching. Until the PNG is present, the neutral WK monogram is shown. Change `HOME_CONTENT.profileImage` in `home-content.js` to use a different file path.
