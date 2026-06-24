"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { RoomNav } from "@/components/room-nav";
import { ThreadRow } from "@/components/thread-row";
import { TokenChip } from "@/components/token-chip";
import { TokenIcon } from "@/components/token-icon";
import { Seal } from "@/components/seal";
import { UsernameDialog } from "@/components/username-dialog";
import { ClaimDialog } from "@/components/claim-dialog";
import { SiteFooter } from "@/components/site-footer";
import { useBadge } from "@/components/badge-context";
import { tokenFor } from "@/lib/tokens";
import { timeAgo, paragraphs } from "@/lib/format";
import { api, ApiError, type Comment, type Post, type UserProfile } from "@/lib/api";

interface PageProps {
  params: Promise<{ handle: string }>;
}

type Tab = "posts" | "comments";

/** Cosmetic seal-picture override stored purely in localStorage (no API). */
interface PfpChoice {
  hash: string;
  color: string;
}

/** localStorage key for the cosmetic, device-only seal-picture override. */
const PFP_STORAGE_KEY = "blindsol:pfp:v1";
/** Handles that already look like a raw anon id are resolved client-side. */
const ANON_HANDLE_PREFIX = "anon_";
const PFP_COLORS = [
  "#C2452A",
  "#14C98E",
  "#7BC242",
  "#F2A900",
  "#4C8DFF",
  "#7A3FE4",
  "#B07F4E",
  "#1B1A17",
];

function loadPfp(): PfpChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PFP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PfpChoice>;
    if (typeof parsed.hash === "string" && typeof parsed.color === "string") {
      return { hash: parsed.hash, color: parsed.color };
    }
  } catch {
    // corrupt value — ignore and fall back to the default seal
  }
  return null;
}

export default function ProfilePage({ params }: PageProps) {
  const { handle } = use(params);
  const [anonId, setAnonId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pickingHandle, setPickingHandle] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [pfpOpen, setPfpOpen] = useState(false);
  const [pfp, setPfp] = useState<PfpChoice | null>(null);

  // Identifies whether the visitor is looking at their own profile, so
  // we can surface "pick a handle" inline instead of burying it in the
  // header dropdown.
  const { active: activeBadge, badges } = useBadge();
  const isOwnProfile = !!activeBadge?.anonId && activeBadge.anonId === anonId;

  // Cosmetic, local-only seal picture override.
  useEffect(() => {
    setPfp(loadPfp());
  }, []);

  const choosePfp = useCallback((choice: PfpChoice) => {
    setPfp(choice);
    try {
      window.localStorage.setItem(PFP_STORAGE_KEY, JSON.stringify(choice));
    } catch {
      // storage may be unavailable (private mode) — the in-memory state still updates
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const resolved = handle.startsWith(ANON_HANDLE_PREFIX)
        ? { anonId: handle, username: null as string | null }
        : await api.resolveHandle(handle);
      setAnonId(resolved.anonId);

      const [p, listPosts, listComments] = await Promise.all([
        api.getUser(resolved.anonId),
        api.getUserPosts(resolved.anonId),
        api.getUserComments(resolved.anonId),
      ]);
      setProfile(p);
      setPosts(listPosts.posts);
      setComments(listComments.comments);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setErr("not_found");
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resolvedAnon = anonId ?? handle;

  // Seal karma = sum of upvotes across the loaded posts + comments.
  const karma = useMemo(() => {
    const fromPosts = posts.reduce((acc, p) => acc + (p.upCount ?? 0), 0);
    const fromComments = comments.reduce((acc, c) => acc + (c.upCount ?? 0), 0);
    return fromPosts + fromComments;
  }, [posts, comments]);

  return (
    <>
      <TopNav />
      <RoomNav />
      <main className="bs-main">
        <Link href="/forum" className="back">
          ← all rooms
        </Link>

        {err === "not_found" ? (
          <NotFound handle={handle} />
        ) : err ? (
          <div className="nocmt">Error: {err}</div>
        ) : loading || !profile ? (
          <div className="nocmt">Loading…</div>
        ) : (
          <>
            <ProfileHeader
              profile={profile}
              anonId={resolvedAnon}
              isOwn={isOwnProfile}
              karma={karma}
              pfp={pfp}
              onEditPfp={() => setPfpOpen((v) => !v)}
              onPickHandle={() => setPickingHandle(true)}
            />

            {isOwnProfile && (
              <HeldRooms badges={badges} />
            )}

            {isOwnProfile && (
              <BadgeRow badges={badges} onClaim={() => setClaiming(true)} />
            )}

            {isOwnProfile && pfpOpen && (
              <PfpPicker
                anonId={resolvedAnon}
                current={pfp}
                onChoose={choosePfp}
                onDone={() => setPfpOpen(false)}
              />
            )}

            <div className="ptabs">
              <button
                className={`ptab${tab === "posts" ? " active" : ""}`}
                onClick={() => setTab("posts")}
              >
                Posts <span className="pt-n">{posts.length}</span>
              </button>
              <button
                className={`ptab${tab === "comments" ? " active" : ""}`}
                onClick={() => setTab("comments")}
              >
                Comments <span className="pt-n">{comments.length}</span>
              </button>
            </div>

            {tab === "posts" ? (
              <PostsList posts={posts} isOwn={isOwnProfile} />
            ) : (
              <CommentsList comments={comments} />
            )}
          </>
        )}

        <SiteFooter />
      </main>

      {pickingHandle && (
        <UsernameDialog
          onClose={() => {
            setPickingHandle(false);
            // refresh so the new handle shows in the header without
            // the user needing to reload the page
            refresh();
          }}
        />
      )}

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

function ProfileHeader({
  profile,
  anonId,
  isOwn,
  karma,
  pfp,
  onEditPfp,
  onPickHandle,
}: {
  profile: UserProfile;
  anonId: string;
  isOwn: boolean;
  karma: number;
  pfp: PfpChoice | null;
  onEditPfp: () => void;
  onPickHandle: () => void;
}) {
  const sealHash = pfp?.hash ?? anonId;

  return (
    <div className="profile">
      <div className="pf-seal">
        <Seal hash={sealHash} size={68} color={pfp?.color} />
        {isOwn && (
          <button className="pf-editpfp" onClick={onEditPfp} type="button">
            edit
          </button>
        )}
      </div>
      <div className="pf-id">
        <h1>
          {profile.username ? `@${profile.username}` : anonId}
          {isOwn && <span className="tagyou">you</span>}
        </h1>
        <p className="pf-sub">
          sealed anon · joined {profile.firstSeen ? `${timeAgo(profile.firstSeen)} ago` : "recently"}
          {isOwn && (
            <>
              {" · "}
              <button className="link" onClick={onPickHandle} type="button">
                {profile.username ? "manage handle" : "pick a handle"}
              </button>
            </>
          )}
        </p>
        <p className="pf-stats">
          <b>{profile.postCount}</b> posts · <b>{profile.commentCount}</b> comments ·{" "}
          <b>{karma}</b> seal karma
        </p>
      </div>
    </div>
  );
}

function HeldRooms({ badges }: { badges: ReturnType<typeof useBadge>["badges"] }) {
  return (
    <div className="pf-tokens">
      <span className="pf-tklabel">rooms unsealed</span>
      {badges.length === 0 ? (
        <span className="pf-none">none yet</span>
      ) : (
        badges.map((b) => {
          const meta = tokenFor(b.kind);
          const sym = meta?.symbol ?? b.kind;
          return (
            <Link
              key={b.badgeId}
              className="tok"
              href={`/forum?room=${b.kind}`}
              style={{ "--tc": meta?.color } as CSSProperties}
            >
              <TokenIcon kind={b.kind} size={15} className="shrink-0" />${sym}
            </Link>
          );
        })
      )}
    </div>
  );
}

function BadgeRow({
  badges,
  onClaim,
}: {
  badges: ReturnType<typeof useBadge>["badges"];
  onClaim: () => void;
}) {
  return (
    <div className="pf-badgerow">
      <span className="pf-tklabel">badges</span>
      {badges.map((b) => {
        const meta = tokenFor(b.kind);
        const sym = meta?.symbol ?? b.kind;
        return (
          <span key={b.badgeId} className="badge mini">
            <TokenIcon kind={b.kind} size={17} className="shrink-0" />${sym}
          </span>
        );
      })}
      <button className="btn solid bclaim" onClick={onClaim} type="button">
        claim more
      </button>
    </div>
  );
}

function PfpPicker({
  anonId,
  current,
  onChoose,
  onDone,
}: {
  anonId: string;
  current: PfpChoice | null;
  onChoose: (c: PfpChoice) => void;
  onDone: () => void;
}) {
  // A couple of seed variants derived from the anon id, so the same person
  // gets visually distinct seal options to pick from.
  const seeds = [anonId, `${anonId}~1`, `${anonId}~2`];
  const options: PfpChoice[] = [];
  for (let i = 0; i < PFP_COLORS.length; i++) {
    options.push({ hash: seeds[i % seeds.length]!, color: PFP_COLORS[i]! });
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <span>Choose your seal picture</span>
        <button className="link" onClick={onDone} type="button">
          done
        </button>
      </div>
      <p className="panel-sub">
        Purely cosmetic and stored on this device only — it never touches the chain or your anon id.
      </p>
      <div className="pfp-grid">
        {options.map((opt) => {
          const on = current?.hash === opt.hash && current?.color === opt.color;
          return (
            <button
              key={`${opt.hash}|${opt.color}`}
              className={`pfp-opt${on ? " on" : ""}`}
              onClick={() => onChoose(opt)}
              type="button"
            >
              <Seal hash={opt.hash} color={opt.color} size={44} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PostsList({ posts, isOwn }: { posts: Post[]; isOwn: boolean }) {
  if (posts.length === 0) {
    return (
      <div className="pf-empty">
        No threads yet.
        {isOwn && (
          <>
            {" "}
            <Link className="link" href="/forum?compose=1">
              Start one →
            </Link>
          </>
        )}
      </div>
    );
  }
  return (
    <ol className="feed">
      {posts.map((p) => (
        <ThreadRow key={p.id} post={p} />
      ))}
    </ol>
  );
}

function CommentsList({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return <div className="pf-empty">No comments yet.</div>;
  }
  return (
    <div className="pcomments">
      {comments.map((c) => {
        const meta = tokenFor(c.badgeKind);
        const symbol = meta?.symbol ?? c.badgeKind;
        return (
          <Link key={c.id} href={`/post/${c.postId}`} className="pcomment">
            <div className="pc-ctx">re: ${symbol}</div>
            <div className="pc-body">
              {paragraphs(c.content).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <div className="pc-meta">
              <span className="up">▲ {c.upCount ?? 0}</span>
              {" · "}
              <TokenChip kind={c.badgeKind} />
              {" · "}
              <span>{timeAgo(c.createdAt)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function NotFound({ handle }: { handle: string }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <span>No such handle</span>
      </div>
      <p className="panel-sub">
        Couldn&apos;t resolve <b>{handle}</b>. Check the spelling, or it may have been released.
      </p>
    </div>
  );
}
