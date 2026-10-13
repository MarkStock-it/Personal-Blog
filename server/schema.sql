-- Schema for the dynamic blog. Applied by `npm run migrate` (idempotent).
-- Charset is utf8mb4 throughout: posts are prose, and prose contains real characters.

CREATE TABLE IF NOT EXISTS posts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(160) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  published_at  DATE         NOT NULL,
  topic         VARCHAR(60)  NOT NULL DEFAULT 'Essays',
  excerpt       VARCHAR(400) NOT NULL DEFAULT '',
  body_md       MEDIUMTEXT   NOT NULL,
  depth         DECIMAL(3,2) NULL COMMENT '0 = at the surface, 1 = far below. Drives drift, scale and blur',
  tint          CHAR(7)      NULL COMMENT '#RRGGBB, or NULL to let the page assign one far from the others',
  tags          VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'Comma separated, for finding the post in the admin',
  meta_title    VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'Overrides the browser title; empty means derive it',
  meta_description VARCHAR(400) NOT NULL DEFAULT '' COMMENT 'Overrides the search/social description; empty means derive it',
  is_published  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_slug (slug),
  KEY idx_published (is_published, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Site copy, so the owner's name, statement and About text are data, not code.
CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(60)  NOT NULL,
  v  MEDIUMTEXT   NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
