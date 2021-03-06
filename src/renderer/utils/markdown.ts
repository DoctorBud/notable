
/* IMPORT */

import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import * as _ from 'lodash';
import * as CRC32 from 'crc-32'; // Not a cryptographic hash function, but it's good enough (and fast!) for our purposes
import * as mermaid from 'mermaid';
import * as path from 'path';
import * as pify from 'pify';
import * as remark from 'remark';
import * as strip from 'strip-markdown';
import * as showdown from 'showdown';
import * as showdownHighlight from 'showdown-highlight';
import * as showdownKatex from 'showdown-katex-studdown';
import * as showdownTargetBlack from 'showdown-target-blank';
import Config from '@common/config';

/* MARKDOWN */

const Markdown = {

  converter: undefined,

  extensions: {

    checkbox () {

      // We are wrapping the metadata (the match index, which is a number) in numbers so that the syntax highlighter won't probably mess with it and it's unlikely that somebody will ever write the same thing

      return [
        { // Adding metadata
          type: 'language',
          regex: /([*+-][ \t]+\[(?:x|X| )?\])(?!\[|\()/gm,
          replace ( match, $1, index ) {
            return `${$1}7381125${index - 2}7381125`; //TODO: The matched string it appears to be wrapped into `\n\n` and `\n\n`, so the index is offsetted by 2, why? Is this because of showdown?
          }
        },
        { // Transforming metadata into attributes
          type: 'output',
          regex: /<input type="checkbox"(?: disabled)?([^>]*)>7381125(\d+?)7381125/gm,
          replace ( match, $1, $2 ) {
            return `<input type="checkbox"${$1} data-index="${$2}">`
          }
        },
        { // Cleaning up leftover metadata
          type: 'output',
          regex: /7381125(\d+?)7381125/gm,
          replace: () => ''
        }
      ];

    },

    resolveRelativeLinks () {

      const {path: attachmentsPath, token: attachmentsToken} = Config.attachments,
            {path: notesPath, token: notesToken} = Config.notes;

      if ( !attachmentsPath || !notesPath ) return [];

      return [{
        type: 'language',
        regex: `\\[([^\\]]*)\\]\\((\\.[^\\)]*)\\)`,
        replace ( match, $1, $2 ) {
          const filePath = path.resolve ( notesPath, $2 );
          if ( filePath.startsWith ( attachmentsPath ) ) {
            return `[${$1}](${attachmentsToken}/${filePath.slice ( attachmentsPath.length )})`;
          } else if ( filePath.startsWith ( notesPath ) ) {
            return `[${$1}](${notesToken}/${filePath.slice ( notesPath.length )})`;
          } else {
            return `[${$1}](file://${encodeURI ( filePath )})`;
          }
        }
      }];

    },

    encodeSpecialLinks () { // Or they won't be parsed as images/links whatever

      return [{
        type: 'language',
        regex: `\\[([^\\]]*)\\]\\(((?:${Config.attachments.token}|${Config.notes.token}|${Config.tags.token})/[^\\)]*)\\)`,
        replace ( match, $1, $2 ) {
          return `[${$1}](${encodeURI ( $2 )})`;
        }
      }];

    },

    attachment () {

      const {path: attachmentsPath, token} = Config.attachments;

      if ( !attachmentsPath ) return [];

      return [
        { // Image
          type: 'output',
          regex: `<img(.*?)src="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<img${$1}src="file://${filePath}" class="attachment" data-filename="${$2}"${$3}>`;
          }
        },
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<a${$1}href="file://${filePath}" class="attachment button gray" data-filename="${$2}"${$3}><i class="icon small">paperclip</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<a${$1}href="file://${filePath}" class="attachment" data-filename="${$2}"${$3}><i class="icon xsmall">paperclip</i>`;
          }
        }
      ];

    },

    note () {

      const {path: notesPath, token} = Config.notes;

      if ( !notesPath ) return [];

      return [
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = path.join ( notesPath, $2 );
            return `<a${$1}href="file://${filePath}" class="note button gray" data-filepath="${filePath}"${$3}><i class="icon small">note</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( notesPath, $2 );
            return `<a${$1}href="file://${filePath}" class="note" data-filepath="${filePath}"${$3}><i class="icon xsmall">note</i>`;
          }
        }
      ];

    },

    tag () {

      const {token} = Config.tags;

      return [
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag button gray" data-tag="${$2}"${$3}><i class="icon small">tag</i><span>${$2}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag" data-tag="${$2}"${$3}><i class="icon xsmall">tag</i>`;
          }
        }
      ];

    },

    katex () {

      try {

        return showdownKatex ( Config.katex );

      } catch ( e ) {

        return `<p class="text-red">[KaTeX error: ${e.message}]</p>`;

      }

    },

    mermaid () {

      mermaid.initialize ( Config.mermaid );

      return [{
        type: 'language',
        regex: '```mermaid([^`]*)```',
        replace ( match, $1 ) {
          const id = `mermaid-${CRC32.str ( $1 )}`;
          try {
            const svg = mermaid.render ( id, $1 );
            return `<div class="mermaid">${svg}</div>`;
          } catch ( e ) {
            $(`#${id}`).remove ();
            return `<p class="text-red">[mermaid error: ${e.message}]</p>`;
          }
        }
      }];

    }

  },

  getConverter () {

    if ( Markdown.converter ) return Markdown.converter;

    const {checkbox, resolveRelativeLinks, encodeSpecialLinks, attachment, note, tag, katex, mermaid} = Markdown.extensions;

    const converter = new showdown.Converter ({
      metadata: true,
      extensions: [showdownHighlight, showdownTargetBlack, checkbox (), resolveRelativeLinks (), encodeSpecialLinks (), attachment (), note (), tag (), katex (), mermaid ()]
    });

    converter.setFlavor ( 'github' );

    Markdown.converter = converter;

    return converter;

  },

  render: _.memoize ( ( str: string ): string => {

    return Markdown.getConverter ().makeHtml ( str );

  }),

  strip: async ( str: string ): Promise<string> => {

    return ( await pify ( remark ().use ( strip ).process )( str ) ).toString ();

  }

};

/* EXPORT */

export default Markdown;
