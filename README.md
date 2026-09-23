# insta-friends-only

Makes instagram.com show only posts and stories from people you follow.

- Keeps the normal home feed so the stories bar stays, and hides every post that isn't from someone you follow.
- Removes the Reels tab and sends `/reels/` back to the feed.
- Removes the Explore grid. On desktop the Explore link is hidden. On mobile, `/explore/` goes to the search page instead, because that link is the search tab there.
- Hides sponsored posts, suggested posts, and "Suggested for you" account blocks.
- Hides reels from friends too (you can turn this off, see below).
- Stories aren't touched. The stories bar already shows only accounts you follow.
- Optional: `useFollowingFeed` sends home to Instagram's chronological Following feed (`/?variant=following`). That page has no stories bar.

It runs in your browser while you're logged in to instagram.com. There's no server, and it never sees your password.

## Install

**Chrome / Edge / Brave (desktop)**

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Reload instagram.com.

**Mac Safari**

1. Install the free [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) app and choose this folder as its scripts folder.
2. Turn on Userscripts in Safari → Settings → Extensions and allow it on `www.instagram.com`.
3. Reload instagram.com.

**iPhone Safari**

1. Install the free [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) app.
2. In the app, tap **Set Directory** and pick this folder. If your Mac Desktop syncs to iCloud, the folder is already on the phone under iCloud Drive → Desktop, and changes sync on their own.
3. Turn on Userscripts in Settings → Apps → Safari → Extensions and allow it on `instagram.com`.
4. Open instagram.com in Safari. If the script isn't listed in the Userscripts menu, open the file once in the Files app so iCloud downloads it.

Safari extensions don't run in Home Screen web apps. To get a Home Screen icon, use Share → Add to Home Screen and turn **off** "Open as Web App" (iOS 26), or make a Shortcut that opens `https://www.instagram.com/` in Safari.

**Firefox / other browsers**

Install Tampermonkey or Violentmonkey, then add `insta-friends-only.user.js` as a new script.

## Settings

Change `CONFIG` at the top of `insta-friends-only.user.js`:

- `hideReelPosts`: set to `false` to keep reels your friends post.
- `useFollowingFeed`: set to `true` for the chronological Following feed. You lose the stories bar.
- `debug`: set to `true` to outline filtered items in red instead of hiding them. Use this to check what gets caught.

## How it decides

A feed post is hidden when any of these are true:

- It's labelled "Sponsored" / "광고".
- It's labelled "Suggested for you" / "Suggested posts" / "회원님을 위한 추천" / "추천 게시물".
- It has a **Follow** / **팔로우** button, which means you don't follow the author.
- It's a reel (only when `hideReelPosts` is on).

Instagram changes its markup often. If something slips through or a friend's post goes missing, turn on `debug` and update the labels or selectors.
