class Compiler {
  constructor(el, vm) {
    //判断el属性是不是元素，如果不是元素，就获取它
    this.el = this.isElementNode(el) ? el : document.querySelector(el);

    //把当前节点中的元素获取到放到内存中，把节点中的内容进行替换
    this.vm = vm;
    let fragment = this.node2fragment(this.el);

    //编译模板
    this.compile(fragment);

    //把内容放回页面
    this.el.appendChild(fragment);
  }

  node2fragment(node) {
    //创建一个文档碎片
    let fragment = document.createDocumentFragment();
    let firstChild;
    while ((firstChild = node.firstChild)) {
      fragment.appendChild(firstChild);
    }
    return fragment;
  }

  //核心编译方法
  compile(node) {
    // 用来编译内存中的dom节点;
    let childNodes = node.childNodes;
    [...childNodes].forEach(child => {
      if (this.isElementNode(child)) {
        this.compileElement(child);
        //如果是元素的话，需要遍历子节点
        this.compile(child);
      } else {
        this.compileText(child);
      }
    });
  }

  isElementNode(node) {
    return node.nodeType === 1;
  }

  //编译元素
  compileElement(node) {
    let attributes = node.attributes; //类数组
    // console.log([...attributes]);

    [...attributes].forEach(attr => {
      let { name, value: expr } = attr;

      //判断是不是指令
      if (this.isDirective(name)) {
        let [, directive] = name.split("-");
        let [directiveName, eventName] = directive.split(":");
        //需要调用不同的指令来处理
        CompileUtil[directiveName](node, expr, this.vm, eventName);
      }
    });
  }

  isDirective(attrName) {
    return attrName.startsWith("v-");
  }

  //编译文本
  compileText(node) {
    //判断当前文本节点中内容是否包含{{xxx}}
    let content = node.textContent;
    if (/\{\{(.+?)\}\}/.test(content)) {
      //找到所有文本
      CompileUtil["text"](node, content, this.vm);
    }
  }
}

CompileUtil = {
  //根据表达式取到对应的数据
  getVal(vm, expr) {
    let arr = expr.split(".");
    return arr.reduce((data, current) => {
      return data[current];
    }, vm.$data);
  },

  setValue(vm, expr, value) {
    expr.split(".").reduce((data, current, index, arr) => {
      if (index === arr.length - 1) {
        return (data[current] = value);
      }
      return data[current];
    }, vm.$data);
  },

  model(node, expr, vm) {
    //node是节点 expr表达式 vm是当前实例
    let value = this.getVal(vm, expr);
    let fn = this.updater["modelUpdater"];

    new Watcher(vm, expr, newVal => {
      //给输入框加一个观察者，如果稍后数据更新了会触发此方法，会拿新值，给输入框赋值。
      fn(node, newVal);
    });

    node.addEventListener("input", e => {
      let value = e.target.value; //获取用户输入的内容
      this.setValue(vm, expr, value);
    });
    fn(node, value);
  },

  html(node, expr, vm) {
    let value = this.getVal(vm, expr);

    let fn = this.updater["htmlUpdater"];
    new Watcher(vm, expr, newVal => {
      fn(node, newVal);
    });

    fn(node, value);
  },

  getContentValue(vm, expr) {
    //遍历表达式，将内容重新替换成一个完整的内容，返还回去。
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(vm, args[1]);
    });
  },

  on(node, expr, vm, eventName) {
    // v-on:click="change"
    node.addEventListener(eventName, e => {
      vm[expr].call(vm, e);
    });
  },

  text(node, expr, vm) {
    let fn = this.updater["textUpdater"];
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      //给表达式每个大括号都加上观察者。
      let a = new Watcher(vm, args[1], () => {
        fn(node, this.getContentValue(vm, expr)); //返回了一个全的字符串
      });

      return this.getVal(vm, args[1]);
    });
    fn(node, content);
  },

  updater: {
    //把数据插入到节点
    modelUpdater(node, value) {
      node.value = value;
    },

    htmlUpdater(node, value) {
      node.innerHTML = value;
    },

    textUpdater(node, value) {
      node.textContent = value;
    }
  }
};

class Observer {
  constructor(data) {
    this.observer(data);
  }
  observer(data) {
    //如果是对象才观察
    if (data && typeof data === "object") {
      for (let key in data) {
        this.defineReactive(data, key, data[key]);
      }
    }
  }
  defineReactive(obj, key, value) {
    this.observer(value);
    let dep = new Dep(); //给每一个属性，都加上一个具有发布订阅的功能。

    Object.defineProperty(obj, key, {
      get() {
        //创建watcher时，会取到对应的内容,并且把watcher放到了全局上。
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      set: newVal => {
        if (newVal != value) {
          this.observer(newVal);
          value = newVal;
          dep.notify();
        }
      }
    });
  }
}

class Dep {
  constructor(key) {
    this.subs = [];
  }
  //订阅
  addSub(watcher) {
    //添加watcher
    this.subs.push(watcher);
  }
  //发布
  notify() {
    this.subs.forEach(watcher => watcher.update());
  }
}

class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm;
    this.expr = expr;
    this.cb = cb;
    //默认先存放一个值
    this.oldValue = this.get();
  }
  get() {
    Dep.target = this; //先把自己放在this上，把观察者和数据关联起来。
    let value = CompileUtil.getVal(this.vm, this.expr);
    Dep.target = null;
    return value;
  }
  update() {
    //更新操作 数据变化后，会调用观察者的update方法
    let newVal = CompileUtil.getVal(this.vm, this.expr);
    if (newVal != this.oldValue) {
      this.cb(newVal);
    }
  }
}

class Vue {
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    this.methods = options.methods;
    this.computed = options.computed;

    //这个根元素存在，编译模板
    if (this.$el) {
      //把数据全部转化成用Object.defineProper来定义
      new Observer(this.$data);

      //把数据获取操作 vm上的取值操作都代理到vm.$data
      for (let key in this.computed) {
        Object.defineProperty(this.$data, key, {
          get: () => {
            return this.computed[key].call(this);
          }
        });
      }

      for (let key in this.methods) {
        Object.defineProperty(this, key, {
          get() {
            return this.methods[key];
          }
        });
      }

      this.proxyVm(this.$data);

      new Compiler(this.$el, this);
    }
  }

  proxyVm(data) {
    for (let key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
        set(newVal) {
          data[key] = newVal;
        }
      });
    }
  }
}
