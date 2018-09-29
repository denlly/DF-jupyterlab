// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
// Modifier: xiaodong Fan

import { showErrorMessage, Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { DocumentManager } from '@jupyterlab/docmanager';

import { Contents, ServerConnection } from '@jupyterlab/services';

import { IIterator } from '@phosphor/algorithm';

import { CommandRegistry } from '@phosphor/commands';

import { PanelLayout, Widget } from '@phosphor/widgets';

import { BreadCrumbs } from './crumbs';

import { DirListing } from './listing';

import { FileBrowserModel } from './model';

import { Uploader } from './upload';

/**
 * The class name added to file browsers.
 * 定义整个FileBrowser的className
 */
const FILE_BROWSER_CLASS = 'jp-FileBrowser';

/**
 * The class name added to the filebrowser crumbs node.
 * 定义面包屑样式
 */
const CRUMBS_CLASS = 'jp-FileBrowser-crumbs';

/**
 * The class name added to the filebrowser toolbar node.
 * 定义FileBrowser的工具栏(按钮部分)
 */
const TOOLBAR_CLASS = 'jp-FileBrowser-toolbar';

/**
 * The class name added to the filebrowser listing node.
 * 定义FileBrowser的工具栏(列表部分)
 */
const LISTING_CLASS = 'jp-FileBrowser-listing';

/**
 * A widget which hosts a file browser.
 *
 * The widget uses the Jupyter Contents API to retrieve contents,
 * and presents itself as a flat list of files and directories with
 * breadcrumbs.
 */
export class FileBrowser extends Widget {
  /**
   * Construct a new file browser.
   *
   * @param model - The file browser view model.
   */
  constructor(options: FileBrowser.IOptions) {
    super();
    this.addClass(FILE_BROWSER_CLASS);
    this.id = options.id;

    const model = (this.model = options.model);
    const renderer = options.renderer;

    model.connectionFailure.connect(
      this._onConnectionFailure,
      this
    );
    this._manager = model.manager;
    this._crumbs = new BreadCrumbs({ model });
    this.toolbar = new Toolbar<Widget>();

    // 操作节流变量
    let directoryPending = false;
    // 定义一个”创建目录“按钮
    let newFolder = new ToolbarButton({
      iconClassName: 'jp-NewFolderIcon jp-Icon jp-Icon-16',
      onClick: () => {
        if (directoryPending === true) {
          return;
        }
        directoryPending = true;
        this._manager
          .newUntitled({
            path: model.path,
            type: 'directory'
          })
          .then(model => {
            this._listing.selectItemByName(model.name);
            directoryPending = false;
          })
          .catch(err => {
            directoryPending = false;
          });
      },
      tooltip: '创建目录'
    });

    // 定义一个上传器
    let uploader = new Uploader({ model });

    // 定义一个目录刷新的按钮
    let refresher = new ToolbarButton({
      iconClassName: 'jp-RefreshIcon jp-Icon jp-Icon-16',
      onClick: () => {
        model.refresh();
      },
      tooltip: 'Refresh File List'
    });
    // 添加 toolbar 列表
    this.toolbar.addItem('newFolder', newFolder);
    this.toolbar.addItem('upload', uploader);
    this.toolbar.addItem('refresher', refresher);

    // 添加到list view的部分
    this._listing = new DirListing({ model, renderer });

    this._crumbs.addClass(CRUMBS_CLASS);
    this.toolbar.addClass(TOOLBAR_CLASS);
    this._listing.addClass(LISTING_CLASS);

    let layout = new PanelLayout();
    layout.addWidget(this.toolbar);
    layout.addWidget(this._crumbs);
    layout.addWidget(this._listing);

    // 将布局赋值到当前的控件里
    this.layout = layout;
    model.restore(this.id);
  }

  /**
   * The model used by the file browser.
   */
  readonly model: FileBrowserModel;

  /**
   * The toolbar used by the file browser.
   */
  readonly toolbar: Toolbar<Widget>;

  /**
   * Create an iterator over the listing's selected items.
   *
   * @returns A new iterator over the listing's selected items.
   */
  selectedItems(): IIterator<Contents.IModel> {
    return this._listing.selectedItems();
  }

  /**
   * Rename the first currently selected item.
   *
   * @returns A promise that resolves with the new name of the item.
   */
  rename(): Promise<string> {
    return this._listing.rename();
  }

  /**
   * Cut the selected items.
   */
  cut(): void {
    this._listing.cut();
  }

  /**
   * Copy the selected items.
   */
  copy(): void {
    this._listing.copy();
  }

  /**
   * Paste the items from the clipboard.
   *
   * @returns A promise that resolves when the operation is complete.
   */
  paste(): Promise<void> {
    return this._listing.paste();
  }

  /**
   * Delete the currently selected item(s).
   *
   * @returns A promise that resolves when the operation is complete.
   */
  delete(): Promise<void> {
    return this._listing.delete();
  }

  /**
   * Duplicate the currently selected item(s).
   *
   * @returns A promise that resolves when the operation is complete.
   */
  duplicate(): Promise<void> {
    return this._listing.duplicate();
  }

  /**
   * Download the currently selected item(s).
   */
  download(): void {
    this._listing.download();
  }

  /**
   * Shut down kernels on the applicable currently selected items.
   *
   * @returns A promise that resolves when the operation is complete.
   */
  shutdownKernels(): Promise<void> {
    return this._listing.shutdownKernels();
  }

  /**
   * Select next item.
   */
  selectNext(): void {
    this._listing.selectNext();
  }

  /**
   * Select previous item.
   */
  selectPrevious(): void {
    this._listing.selectPrevious();
  }

  /**
   * Find a model given a click.
   *
   * @param event - The mouse event.
   *
   * @returns The model for the selected file.
   */
  modelForClick(event: MouseEvent): Contents.IModel | undefined {
    return this._listing.modelForClick(event);
  }

  /**
   * Handle a connection lost signal from the model.
   */
  private _onConnectionFailure(sender: FileBrowserModel, args: Error): void {
    if (this._showingError) {
      return;
    }
    this._showingError = true;

    let title = 'Server Connection Error';
    let networkMsg =
      'A connection to the Jupyter server could not be established.\n' +
      'JupyterLab will continue trying to reconnect.\n' +
      'Check your network connection or Jupyter server configuration.\n';

    // Check for a fetch error.
    if (args instanceof ServerConnection.NetworkError) {
      args.message = networkMsg;
    } else if (args instanceof ServerConnection.ResponseError) {
      if (args.response.status === 404) {
        title = 'Directory not found';
        args.message = `Directory not found: "${this.model.path}"`;
      }
    }

    showErrorMessage(title, args).then(() => {
      this._showingError = false;
    });
  }

  private _crumbs: BreadCrumbs;
  private _listing: DirListing;
  private _manager: DocumentManager;
  private _showingError = false;
}

/**
 * The namespace for the `FileBrowser` class statics.
 *  定义 FileBrowser 的 Ioptionsde
 */
export namespace FileBrowser {
  /**
   * An options object for initializing a file browser widget.
   */
  export interface IOptions {
    /**
     * The command registry for use with the file browser.
     */
    commands: CommandRegistry;

    /**
     * The widget/DOM id of the file browser.
     */
    id: string;

    /**
     * A file browser model instance.
     */
    model: FileBrowserModel;

    /**
     * An optional renderer for the directory listing area.
     *
     * The default is a shared instance of `DirListing.Renderer`.
     */
    renderer?: DirListing.IRenderer;
  }
}
