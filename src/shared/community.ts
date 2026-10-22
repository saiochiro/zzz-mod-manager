/**
 * ProxyLaunch community page (Supabase).
 * The anon key is public by design: it only allows what the database rules in
 * supabase/community.sql allow (reading published posts, and posting/liking/reporting
 * as yourself once signed in). Never put the service_role key in the app.
 */
export const SUPABASE_URL = 'https://xedcdqfvskhvzxsfocmi.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZGNkcWZ2c2todnp4c2ZvY21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2Mjg4ODUsImV4cCI6MjEwODIwNDg4NX0.Lh6_dbETXe6nCIZixd-c-Mwhcs9uRuU8KwlA6ozrNlA';

/** Must be listed in Supabase > Authentication > URL Configuration > Redirect URLs. */
export const AUTH_CALLBACK_PORT = 47821;
export const AUTH_CALLBACK_URL = `http://127.0.0.1:${AUTH_CALLBACK_PORT}/auth/callback`;

export interface CommunityProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  banned: boolean;
}

export interface CommunityPost {
  id: string;
  author_id: string;
  agent_id: string;
  name: string;
  description: string;
  recipe: import('./types').WorkshopRecipe;
  part_names: string[];
  source_gb_ids: number[];
  thumbnail_url: string | null;
  is_nsfw: boolean;
  nsfw_reasons: string[];
  status: 'published' | 'hidden' | 'removed';
  like_count: number;
  report_count: number;
  created_at: string;
  author: { display_name: string; avatar_url: string | null } | null;
}

export type CommunityView = 'all' | 'mine' | 'moderation';

export interface CommunityQuery {
  view: CommunityView;
  sort: 'new' | 'top';
  agentId?: string | null;
  hideNsfw: boolean;
  page: number;
}

export interface CommunityPage {
  posts: CommunityPost[];
  likedIds: string[];
  /** Open reports per post (moderation view only). */
  reports: Record<string, Array<{ reason: string; created_at: string }>>;
  hasMore: boolean;
}
