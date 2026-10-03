// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import Input from '../web/src/components/ui/input/Input.vue'
it('输入组件保留可访问属性并向表单传递用户输入', async () => {
  const wrapper = mount(Input, {
    props: { modelValue: '' },
    attrs: { id: 'email', type: 'email', 'aria-label': '邮箱地址', required: true },
  })
  const field = wrapper.get('input[aria-label="邮箱地址"]')
  await field.setValue('reader@example.com')
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['reader@example.com'])
  expect(field.attributes('type')).toBe('email')
  expect(field.attributes('required')).toBeDefined()
})
