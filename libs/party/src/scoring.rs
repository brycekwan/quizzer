use crate::types::GameConfig;

pub struct ScoreInput {
    pub elapsed_ms: i64,
    pub time_limit_seconds: i64,
    pub scale_ms: i64,
    pub base_score: i64,
    pub min_score: i64,
    pub is_correct: bool,
    pub multiplier: Option<f64>,
}

/// Linear time-based score. Wrong answers are zero. Matches `Math.round`.
pub fn compute_question_score(input: ScoreInput) -> i64 {
    if !input.is_correct {
        return 0;
    }

    let factor = match input.multiplier {
        Some(multiplier) if multiplier.is_finite() && multiplier > 0.0 => multiplier,
        _ => 1.0,
    };

    let points = if input.scale_ms <= 0 || input.time_limit_seconds <= 0 {
        input.min_score
    } else {
        let limit_ms = input.time_limit_seconds * 1000;
        let clamped = input.elapsed_ms.clamp(0, limit_ms);
        let total_steps = limit_ms / input.scale_ms;
        if total_steps <= 0 {
            input.min_score.max(input.base_score)
        } else {
            let step = clamped / input.scale_ms;
            let raw = input.base_score as f64
                - (step as f64 * (input.base_score - input.min_score) as f64) / total_steps as f64;
            js_round(raw).max(input.min_score)
        }
    };

    js_round(points as f64 * factor)
}

pub fn resolve_base_score(question_score: Option<i64>, config: &GameConfig) -> i64 {
    question_score.unwrap_or(config.default_score)
}

fn js_round(value: f64) -> i64 {
    value.round() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::DEFAULT_GAME_CONFIG;

    fn base(elapsed_ms: i64) -> ScoreInput {
        ScoreInput {
            elapsed_ms,
            time_limit_seconds: 30,
            scale_ms: 100,
            base_score: 1000,
            min_score: 100,
            is_correct: true,
            multiplier: None,
        }
    }

    #[test]
    fn full_base_score_at_zero() {
        assert_eq!(compute_question_score(base(0)), 1000);
    }

    #[test]
    fn min_score_at_deadline() {
        assert_eq!(compute_question_score(base(30_000)), 100);
    }

    #[test]
    fn decreases_linearly_by_scale_steps() {
        let early = compute_question_score(base(100));
        let later = compute_question_score(base(10_000));
        assert!(early < 1000);
        assert!(later < early);
        assert!(later >= 100);
    }

    #[test]
    fn zero_for_incorrect() {
        let mut input = base(0);
        input.is_correct = false;
        assert_eq!(compute_question_score(input), 0);
    }

    #[test]
    fn clamps_elapsed_past_deadline() {
        assert_eq!(compute_question_score(base(60_000)), 100);
    }

    #[test]
    fn per_question_base_via_resolve() {
        let base_score = resolve_base_score(Some(1200), &DEFAULT_GAME_CONFIG);
        assert_eq!(base_score, 1200);
        let mut input = base(0);
        input.base_score = base_score;
        assert_eq!(compute_question_score(input), 1200);
    }

    #[test]
    fn applies_multiplier_to_correct_answers() {
        let mut doubled = base(0);
        doubled.multiplier = Some(2.0);
        assert_eq!(compute_question_score(doubled), 2000);
        let mut tripled = base(0);
        tripled.multiplier = Some(3.0);
        assert_eq!(compute_question_score(tripled), 3000);
    }

    #[test]
    fn skips_multiplier_on_wrong_answers() {
        let mut input = base(0);
        input.is_correct = false;
        input.multiplier = Some(3.0);
        assert_eq!(compute_question_score(input), 0);
    }
}
