package com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence

import org.json.JSONObject

data class FmAttribute(val name: String, val value: Int)

data class FmPositionFit(val position: String, val fit: Int)

data class FmFoot(val left: Int, val right: Int)

data class FmBestPosition(val position: String, val fit: Int)

data class FmIntelligenceData(
    val playerName: String,
    val ca: Int,
    val pa: Int,
    val potentialGap: Int,
    val tier: String,
    val dimensionScores: Map<String, Int>,
    val topAttributes: List<FmAttribute>,
    val weakAttributes: List<FmAttribute>,
    val positionFit: List<FmPositionFit>,
    val bestPosition: FmBestPosition?,
    val foot: FmFoot?,
    val heightCm: Int
)

fun parseFmIntelligenceData(json: JSONObject): FmIntelligenceData {
    val dimObj = json.optJSONObject("dimension_scores")
    val dimensionScores = mutableMapOf<String, Int>()
    if (dimObj != null) {
        dimObj.keys().forEach { key ->
            if (key != "overall") dimensionScores[key] = dimObj.optInt(key, 0)
        }
    }

    val topArr = json.optJSONArray("top_attributes")
    val topAttributes = mutableListOf<FmAttribute>()
    if (topArr != null) {
        for (i in 0 until topArr.length()) {
            val a = topArr.getJSONObject(i)
            topAttributes.add(FmAttribute(a.optString("name", ""), a.optInt("value", 0)))
        }
    }

    val weakArr = json.optJSONArray("weak_attributes")
    val weakAttributes = mutableListOf<FmAttribute>()
    if (weakArr != null) {
        for (i in 0 until weakArr.length()) {
            val a = weakArr.getJSONObject(i)
            weakAttributes.add(FmAttribute(a.optString("name", ""), a.optInt("value", 0)))
        }
    }

    val posObj = json.optJSONObject("position_fit")
    val positionFit = mutableListOf<FmPositionFit>()
    if (posObj != null) {
        posObj.keys().forEach { key ->
            positionFit.add(FmPositionFit(key, posObj.optInt(key, 0)))
        }
    }
    positionFit.sortByDescending { it.fit }

    val bestObj = json.optJSONObject("best_position")
    val bestPosition = bestObj?.let {
        FmBestPosition(it.optString("position", ""), it.optInt("fit", 0))
    }

    val footObj = json.optJSONObject("foot")
    val foot = footObj?.let { FmFoot(it.optInt("left", 0), it.optInt("right", 0)) }

    return FmIntelligenceData(
        playerName = json.optString("player_name", ""),
        ca = json.optInt("ca", 0),
        pa = json.optInt("pa", 0),
        potentialGap = json.optInt("potential_gap", 0),
        tier = json.optString("tier", "unknown"),
        dimensionScores = dimensionScores,
        topAttributes = topAttributes,
        weakAttributes = weakAttributes,
        positionFit = positionFit,
        bestPosition = bestPosition,
        foot = foot,
        heightCm = json.optInt("height_cm", 0)
    )
}
