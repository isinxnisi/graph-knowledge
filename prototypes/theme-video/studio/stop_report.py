"""Operator-facing explanations for a single stopped trial, including older ledgers."""
import json
import re


def _summary(text, limit):
    if not isinstance(text, str):
        return ""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    # Prefer a whole sentence. Full diagnostics stay in the history.
    last = text.rfind("。", 0, limit)
    return text[:last + 1] if last >= 0 else text[:limit - 1].rstrip() + "…"


def _material_decision(folder, error, proposal):
    try:
        record = json.loads((folder / "editorial-decision.json").read_text(encoding="utf-8"))
        decision = record["decision"]
        if not isinstance(decision, dict):
            return {}
        if decision.get("outcome") == "wait" and decision.get("reason") == error:
            return decision
        if decision.get("outcome") == "alternative" and proposal:
            stored = decision.get("alternative")
            if isinstance(stored, dict) and all(stored.get(k) == proposal[k] for k in ("title", "brief", "reason")):
                return decision
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return {}


def _material_reason(folder, run, brief):
    proposal, error = run["editorialAlternative"], run["error"] or ""
    decision = _material_decision(folder, error, proposal)
    reason = _summary(decision.get("blockingPoint"), 200)
    if not reason and proposal:
        # Older decisions describe both the blocker and the proposed new story in one paragraph.
        first_sentences = re.split(r"(?<=。)(?![」』])", proposal["reason"], maxsplit=2)[:2]
        reason = _summary("".join(first_sentences), 150)
    if not reason:
        detail = re.sub(r"(?<![a-zA-Z0-9])(?:ref-\d+|research-[0-9a-f]{16})(?![a-zA-Z0-9])",
                        "参照資料", error.removeprefix("追加資料が必要です。"))
        reason = "この案を今の材料で進められるか、確認が残っています。" + _summary(detail, 150)
    impact = _summary(decision.get("viewerImpact"), 180)
    if "viewerImpact" not in decision and decision and not run["chosenAlternative"]:
        payoff = next((line.removeprefix("見終えたときの発見　").strip() for line in brief.splitlines()
                       if line.startswith("見終えたときの発見　")), "")
        if payoff:
            impact = "「" + _summary(payoff, 160).removesuffix("。") + "」。元案で目指したこの発見を映像で伝えるには、資料の確認が残っています。"
    next_step = "「追加調査して再開」で元の案を続けられます。資料のURLは任意です。"
    if proposal:
        if proposal["startedRunId"]:
            next_step += " 別案はすでに選択済みです。生成履歴からその試行を確認できます。"
        else:
            next_step += " 提案された別案の内容を開き、別の試行として始めることもできます。"
    else:
        next_step += " 切り口を変えたい場合は「ほかの動画案を見る」で候補を確認できます。"
    return reason, impact, next_step


def _failure(run):
    error = run["error"] or ""
    research = run["canAddMaterialLeads"]
    retry = "追加調査して再開" if research else "再開"
    if "モデルの利用上限に達しました" in error:
        return "選んだモデルが利用上限に達したため、処理が止まりました。", f"モデルが再び使えるようになったら「{retry}」で同じ試行を続けられます。"
    if "このアカウントでは指定モデルを利用できません" in error:
        next_step = ("元の日本語版を選び、英語版の制作設定で利用できるモデルを選んでください。"
                     if run["langs"] == ["en"] else "「この案件に試行を追加」で利用できるモデルを選んでください。")
        return "選んだモデルをこのアカウントで利用できず、生成が止まりました。", next_step
    if "接続・ログイン状態を確認" in error:
        return "選んだモデルから生成結果を受け取れませんでした。", f"接続・ログイン状態を確認し、「{retry}」で同じ試行を続けてください。"
    if research:
        return "追加調査の処理が完了しなかったため、台本の制作が止まっています。", "調査記録のエラーを確認し、「追加調査して再開」を選んでください。資料のURLも添えられます。"
    if run["plan"]:
        reason = "台本を保存したあと、映像を仕上げる工程で処理が止まりました。"
    else:
        reason = "台本を準備する工程で処理が止まりました。"
    if "\n" not in error and re.search(r"[ぁ-ん]", error) and not re.search(r"[/\\]|https?:|Traceback", error):
        reason += _summary(error, 120)
    return reason, "停止時の記録を確認し、「再開」で同じ試行を続けられます。"


def stop_report(run, folder, theme, idea_title, brief):
    status = run["status"]
    impact = ""
    if status == "needs_material":
        reason, impact, next_step = _material_reason(folder, run, brief or "")
    elif status == "needs_revision":
        diagnostic = run["error"] or ""
        old_audit = "清書稿の再確認で改稿が必要です。再開すると指摘を引き継ぎます。"
        field_limit = "指摘を返して2回修正しました。再開すると直近の稿と指摘を引き継ぎます。"
        if diagnostic.startswith(old_audit):
            reason = "当時の制作室は、改稿後の確認で2回指摘が残ると自動改稿を止めていました。" + _summary(diagnostic[len(old_audit):], 180)
        elif diagnostic.startswith(field_limit):
            reason = "同じ工程の出力を2回自動修正しても、確認を通らなかったため停止しました。" + _summary(diagnostic[len(field_limit):], 180)
        else:
            reason = _summary(diagnostic, 240) or "台本の確認で、修正が必要な点が残りました。"
        next_step = "「改稿を再開」で直近の出力と指摘を引き継ぎ、同じ試行で修正します。"
    elif status == "failed":
        reason, next_step = _failure(run)
    elif status == "interrupted":
        reasons = {"待機中に中断しました": "中断の操作により、順番待ちの段階で制作を止めました。",
                   "保存した工程から再開できます": "中断の操作により、工程の区切りで制作を止めました。",
                   "停止した工程から再開できます": "制作室の起動時に、前回の実行が完了していないことを検出しました。"}
        reason = reasons.get(run["progress"], "制作が途中で中断しました。")
        next_step = "「再開」で同じ試行の制作を続けられます。"
    elif status == "script_ready" and run["plan"]:
        reason = "台本が用意できました。映像を生成する前に、内容を確認できる状態です。"
        next_step = "場面ごとの台詞を確認してください。修正した場合は台本を保存し、使う台本を選んで映像を生成します。"
    else:
        return None
    plan = run["plan"] or {}
    if status != "script_ready" and "ja" in run["langs"] and (plan.get("titles") or {}).get("ja") and plan.get("scenes"):
        next_step += " 「この台本をもとに新しい試行」では、日本語の台本を引き継いで作り直せます。"
    chosen = run["chosenAlternative"] or {}
    first_line = next((line.strip() for line in (brief or "").splitlines() if line.strip()), "")
    concept = chosen.get("title") or idea_title or (plan.get("titles") or {}).get("ja") or first_line.removeprefix("仮題　")
    return {"theme": _summary(theme, 160), "concept": _summary(concept, 140), "reason": reason, "impact": impact,
            "next": next_step}
