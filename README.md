# Orbyt Designs

The website editor your whole team builds with.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | Welcome page that explains Orbyt |
| `signin.html` | Sign in with a link sent to your email (no passwords) |
| `app.html`, `app.js`, `app.css` | Your team: sites, members, roles, invites, settings |
| `editor.html` + `core.js`, `canvas.js`, `panels.js`, `io.js`, `editor.css` | The editor |
| `cloud.js` | Loads a team's site, saves changes to the team, page locking |
| `runtime.js` | Powers countdowns, pop-ups and animations on published sites |
| `privacy.html`, `terms.html` | Plain-language privacy and terms pages |
| `config.js` | Your Supabase project address and public key |
| `supabase.sql` | Database setup (run once) |
| `orbyt.js`, `site.css` | Shared helpers and brand styles |
| `lib/` | Bundled libraries (Supabase, JSZip) so nothing loads from outside sites |
| `favicon.svg`, `og-image.png` | Tab icon and the picture shown when the link is shared |

## One-time setup (about 10 minutes)

### 1. Set up the database
1. In Supabase, open your project and go to **SQL Editor → New query**.
2. Paste in everything from `supabase.sql` and click **Run**.
3. It should finish with "Success. No rows returned." You can run it again later; it only adds what's missing.

### 2. Put the site online
Make sure the hidden `.nojekyll` file gets uploaded too. It tells GitHub Pages to publish every file exactly as is.
1. Make a new GitHub repo, for example `orbyt`.
2. Upload everything in this folder (not the folder itself) and commit.
3. **Settings → Pages:** Source "Deploy from a branch," branch `main`, folder `/ (root)`. Save.
4. After a minute your address appears, like `https://yourname.github.io/orbyt/`.

### 3. Tell Supabase where the site lives
In Supabase go to **Authentication → URL Configuration**:
- **Site URL:** your address from step 2, like `https://yourname.github.io/orbyt/`
- **Redirect URLs:** add `https://yourname.github.io/orbyt/**`

Sign-in links only work for addresses listed there.

### 4. Optional
- **Contact email:** put yours in `config.js` (`contactEmail`) so the Privacy page shows it.
- **More sign-in emails:** Supabase's built-in email sender only sends a few emails per hour. That's fine for one team. If more people join, connect your own email service under **Authentication → Emails → SMTP Settings**.
- **Futura PT:** the pages use Jost, a free look-alike, unless Futura PT is installed. To use the real font on the live site, make an Adobe Fonts web project and add its stylesheet link to the pages.

## First run
1. Open your site's address and click **Get started**.
2. Type your email, open the link that arrives **on the same device**, and you're in.
3. Name your team, then **Add a site** and upload your team website's folder or ZIP.
4. **Members → Invite someone** makes a link to send to each teammate.

## Who can do what

| | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| Look at sites | ✓ | ✓ | ✓ | ✓ |
| Edit pages and photos | ✓ | ✓ | ✓ | |
| Team colors and fonts | ✓ | ✓ | switch | |
| Schedule and lists (Data panel) | ✓ | ✓ | switch | |
| Download the site | ✓ | ✓ | switch | |
| Invite people, change roles | ✓ | ✓ | | |
| Make someone an admin | ✓ | | | |
| Delete a site | ✓ | ✓ | | |
| Delete the team | ✓ | | | |

Editors' switches are on by default; turn them off per person on the Members tab. You can also limit someone to certain pages with **Pages…**.

**One person edits a page at a time.** If a teammate is on a page, you can look, ask them to hand it over, or edit a different page. A page frees up when they leave or after 10 quiet minutes.

## How your team's things stay private
Every table has row-level security, so the database checks "is this person on this team, and does their role allow this?" on every request. Hiding buttons in the editor is only for clarity; even someone who tampers with the page can't read or change another team's sites. Files are stored privately as `team id / site id / file`, and writes are checked against the team.

## The editor without an account
`editor.html` on its own still works like before: open a site folder or ZIP from your computer. Your work is saved in that browser only.
