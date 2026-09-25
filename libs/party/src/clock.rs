use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Wall clock or a test clock. Game timers read this instead of sleeping.
#[derive(Clone)]
pub struct Clock {
    manual: Option<Arc<AtomicI64>>,
}

impl Clock {
    pub fn system() -> Self {
        Self { manual: None }
    }

    pub fn manual(start_ms: i64) -> Self {
        Self {
            manual: Some(Arc::new(AtomicI64::new(start_ms))),
        }
    }

    pub fn is_manual(&self) -> bool {
        self.manual.is_some()
    }

    pub fn now(&self) -> i64 {
        if let Some(manual) = &self.manual {
            manual.load(Ordering::Relaxed)
        } else {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or(0)
        }
    }

    pub fn set(&self, now_ms: i64) {
        if let Some(manual) = &self.manual {
            manual.store(now_ms, Ordering::Relaxed);
        }
    }
}

/// 2026-01-01T00:00:00.000Z
pub const EPOCH_2026_MS: i64 = 1_767_225_600_000;
/// 2026-01-01T12:00:00.000Z
pub const NOON_2026_MS: i64 = 1_767_268_800_000;
