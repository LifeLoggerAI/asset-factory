function buildShort(topic) {
  return {
    type: "short",
    durationTarget: "30-60s",
    hooks: [
      `${topic} is changing everything.`,
      `Nobody is ready for this shift in ${topic}.`,
      `This is happening right now in ${topic}.`
    ],
    structure: [
      "Hook (0-3s)",
      "Main Point (3-40s)",
      "Closing CTA (40-60s)"
    ]
  }
}

function buildLong(topic) {
  return {
    type: "long",
    durationTarget: "8-12min",
    hooks: [
      `The complete breakdown of ${topic}.`,
      `Why ${topic} is the future.`,
      `The hidden impact of ${topic}.`
    ],
    structure: [
      "Intro (0-1min)",
      "Context + Problem (1-4min)",
      "Deep Dive Analysis (4-10min)",
      "Conclusion + Future Implications"
    ]
  }
}

function buildThread(topic) {
  return {
    type: "thread",
    durationTarget: "10-15 posts",
    hooks: [
      `Thread: ${topic} is about to shift.`,
      `You need to understand ${topic}.`,
      `Here’s what nobody tells you about ${topic}.`
    ],
    structure: [
      "Tweet 1: Hook",
      "Tweet 2-10: Breakdown",
      "Final Tweet: Summary + CTA"
    ]
  }
}

module.exports = { buildShort, buildLong, buildThread }
