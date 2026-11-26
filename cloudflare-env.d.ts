declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CLUB_STANDALONE?: string;
    CLUB_ACCESS_AUD?: string;
  }
}
