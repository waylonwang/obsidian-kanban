import { Extension as FromMarkdownExtension, Token } from 'mdast-util-from-markdown';
import { markdownLineEndingOrSpace } from 'micromark-util-character';
import { Code, Effects, Extension, State } from 'micromark-util-types';

import { getSelf } from './helpers';

// 优先级解析器：匹配 !xxx 格式
export function priorityExtension(): Extension {
  const name = 'priority';
  const markerCharCode = '!'.charCodeAt(0);

  function tokenize(effects: Effects, ok: State, nok: State) {
    let data = false;
    const self = this;

    return start;

    function start(code: Code) {
      // 必须在行首或空格后
      if (
        code !== markerCharCode ||
        (self.previous !== null && !/\s/.test(String.fromCharCode(self.previous)))
      ) {
        return nok(code);
      }

      effects.enter(name as any);
      effects.enter(`${name}Marker` as any);
      effects.consume(code);
      effects.exit(`${name}Marker` as any);
      return consumeData;
    }

    function consumeData(code: Code) {
      effects.enter(`${name}Data` as any);
      effects.enter(`${name}Target` as any);
      return consumeTarget(code);
    }

    function consumeTarget(code: Code) {
      const char = String.fromCharCode(code as number);

      if (
        code === null ||
        markdownLineEndingOrSpace(code) ||
        /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s\n\r]/.test(char)
      ) {
        if (!data) return nok(code);
        effects.exit(`${name}Target` as any);
        effects.exit(`${name}Data` as any);
        effects.exit(name as any);
        return ok(code);
      }

      data = true;
      effects.consume(code);
      return consumeTarget;
    }
  }

  const call = { tokenize: tokenize };

  return {
    text: { [markerCharCode]: call },
  };
}

export function priorityFromMarkdown(): FromMarkdownExtension {
  const name = 'priority';

  function enterPriority(token: Token) {
    this.enter(
      {
        type: name,
        value: null,
      },
      token
    );
  }

  function exitPriorityTarget(token: Token) {
    const target = this.sliceSerialize(token);
    const current = getSelf(this.stack);
    (current as any).value = target;
  }

  function exitPriority(token: Token) {
    this.exit(token);
  }

  return {
    enter: {
      [name]: enterPriority,
    },
    exit: {
      [`${name}Target`]: exitPriorityTarget,
      [name]: exitPriority,
    },
  };
}

// 负责人解析器：匹配 @xxx 格式
export function assigneeExtension(): Extension {
  const name = 'assignee';
  const markerCharCode = '@'.charCodeAt(0);

  function tokenize(effects: Effects, ok: State, nok: State) {
    let data = false;
    const self = this;

    return start;

    function start(code: Code) {
      // 必须在行首或空格后
      if (
        code !== markerCharCode ||
        (self.previous !== null && !/\s/.test(String.fromCharCode(self.previous)))
      ) {
        return nok(code);
      }

      effects.enter(name as any);
      effects.enter(`${name}Marker` as any);
      effects.consume(code);
      effects.exit(`${name}Marker` as any);
      return consumeData;
    }

    function consumeData(code: Code) {
      effects.enter(`${name}Data` as any);
      effects.enter(`${name}Target` as any);
      return consumeTarget(code);
    }

    function consumeTarget(code: Code) {
      const char = String.fromCharCode(code as number);

      if (
        code === null ||
        markdownLineEndingOrSpace(code) ||
        /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s\n\r]/.test(char)
      ) {
        if (!data) return nok(code);
        effects.exit(`${name}Target` as any);
        effects.exit(`${name}Data` as any);
        effects.exit(name as any);
        return ok(code);
      }

      data = true;
      effects.consume(code);
      return consumeTarget;
    }
  }

  const call = { tokenize: tokenize };

  return {
    text: { [markerCharCode]: call },
  };
}

export function assigneeFromMarkdown(): FromMarkdownExtension {
  const name = 'assignee';

  function enterAssignee(token: Token) {
    this.enter(
      {
        type: name,
        value: null,
      },
      token
    );
  }

  function exitAssigneeTarget(token: Token) {
    const target = this.sliceSerialize(token);
    const current = getSelf(this.stack);
    (current as any).value = target;
  }

  function exitAssignee(token: Token) {
    this.exit(token);
  }

  return {
    enter: {
      [name]: enterAssignee,
    },
    exit: {
      [`${name}Target`]: exitAssigneeTarget,
      [name]: exitAssignee,
    },
  };
}